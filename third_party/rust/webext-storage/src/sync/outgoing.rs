/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The "outgoing" part of syncing - building the payloads to upload and
// managing the sync state of the local DB.

use interrupt_support::Interruptee;
use rusqlite::{Connection, Row, Transaction};
use sql_support::ConnExt;
use sync15::bso::OutgoingBso;
use sync_guid::Guid as SyncGuid;

use crate::error::*;

use super::WebextRecord;

fn outgoing_from_row(row: &Row<'_>) -> Result<OutgoingBso> {
    let guid: SyncGuid = row.get("guid")?;
    let ext_id: String = row.get("ext_id")?;
    let raw_data: Option<String> = row.get("data")?;
    Ok(match raw_data {
        Some(raw_data) => {
            let record = WebextRecord {
                guid,
                ext_id,
                data: raw_data,
            };
            OutgoingBso::from_content_with_id(record)?
        }
        None => OutgoingBso::new_tombstone(guid.into()),
    })
}

/// Stages info about what should be uploaded in a temp table. This should be
/// called in the same transaction as `apply_actions`. record_uploaded() can be
/// called after the upload is complete and the data in the temp table will be
/// used to update the local store.
pub fn stage_outgoing(tx: &Transaction<'_>) -> Result<()> {
    let sql = "
        -- Stage outgoing items. The item may not yet have a GUID (ie, it might
        -- not already be in either the mirror nor the incoming staging table),
        -- so we generate one if it doesn't exist.
        INSERT INTO storage_sync_outgoing_staging
        (guid, ext_id, data, sync_change_counter)
        SELECT coalesce(m.guid, s.guid, generate_guid()),
        l.ext_id, l.data, l.sync_change_counter
        FROM storage_sync_data l
        -- left joins as one or both may not exist.
        LEFT JOIN storage_sync_mirror m ON m.ext_id = l.ext_id
        LEFT JOIN storage_sync_staging s ON s.ext_id = l.ext_id
        WHERE sync_change_counter > 0;

        -- At this point, we've merged in all new records, so copy incoming
        -- staging into the mirror so that it matches what's on the server.
        INSERT OR REPLACE INTO storage_sync_mirror (guid, ext_id, data)
        SELECT guid, ext_id, data FROM temp.storage_sync_staging;

        -- And copy any incoming records that we aren't reuploading into the
        -- local table. We'll copy the outgoing ones into the mirror and local
        -- after we upload them.
        INSERT OR REPLACE INTO storage_sync_data (ext_id, data, sync_change_counter)
        SELECT ext_id, data, 0
        FROM storage_sync_staging s
        WHERE ext_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM storage_sync_outgoing_staging o
                       WHERE o.guid = s.guid);";
    tx.execute_batch(sql)?;
    Ok(())
}

/// Returns a vec of the outgoing records which should be uploaded.
pub fn get_outgoing(conn: &Connection, signal: &dyn Interruptee) -> Result<Vec<OutgoingBso>> {
    let sql = "SELECT guid, ext_id, data FROM storage_sync_outgoing_staging";
    let elts = conn
        .conn()
        .query_rows_and_then(sql, [], |row| -> Result<_> {
            signal.err_if_interrupted()?;
            outgoing_from_row(row)
        })?;

    log::debug!("get_outgoing found {} items", elts.len());
    Ok(elts.into_iter().collect())
}

/// Record the fact that items were uploaded. This updates the state of the
/// local DB to reflect the state of the server we just updated.
/// Note that this call is almost certainly going to be made in a *different*
/// transaction than the transaction used in `stage_outgoing()`, and it will
/// be called once per batch upload.
pub fn record_uploaded(
    tx: &Transaction<'_>,
    items: &[SyncGuid],
    signal: &dyn Interruptee,
) -> Result<()> {
    log::debug!(
        "record_uploaded recording that {} items were uploaded",
        items.len()
    );

    // Updating the `was_uploaded` column fires the `record_uploaded` trigger,
    // which updates the local change counter and writes the uploaded record
    // data back to the mirror.
    sql_support::each_chunk(items, |chunk, _| -> Result<()> {
        signal.err_if_interrupted()?;
        let sql = format!(
            "UPDATE storage_sync_outgoing_staging SET
                 was_uploaded = 1
             WHERE guid IN ({})",
            sql_support::repeat_sql_vars(chunk.len()),
        );
        tx.execute(&sql, rusqlite::params_from_iter(chunk))?;
        Ok(())
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::test::new_syncable_mem_db;
    use super::*;
    use interrupt_support::NeverInterrupts;

    #[test]
    fn test_simple() -> Result<()> {
        let db = new_syncable_mem_db();
        let conn = db.get_connection()?;
        let tx = conn.unchecked_transaction()?;

        tx.execute_batch(
            r#"
            INSERT INTO storage_sync_data (ext_id, data, sync_change_counter)
            VALUES
                ('ext_no_changes', '{"foo":"bar"}', 0),
                ('ext_with_changes', '{"foo":"bar"}', 1);
        "#,
        )?;

        stage_outgoing(&tx)?;
        let changes = get_outgoing(&tx, &NeverInterrupts)?;
        assert_eq!(changes.len(), 1);
        let record: serde_json::Value = serde_json::from_str(&changes[0].payload).unwrap();
        let ext_id = record.get("extId").unwrap().as_str().unwrap();

        assert_eq!(ext_id, "ext_with_changes");

        record_uploaded(
            &tx,
            changes
                .into_iter()
                .map(|p| p.envelope.id)
                .collect::<Vec<SyncGuid>>()
                .as_slice(),
            &NeverInterrupts,
        )?;

        let counter: i32 = tx.conn().query_one(
            "SELECT sync_change_counter FROM storage_sync_data WHERE ext_id = 'ext_with_changes'",
        )?;
        assert_eq!(counter, 0);
        Ok(())
    }

    #[test]
    fn test_payload_serialization() {
        let record = WebextRecord {
            guid: SyncGuid::new("guid"),
            ext_id: "ext-id".to_string(),
            data: "{}".to_string(),
        };

        let outgoing = OutgoingBso::from_content_with_id(record).unwrap();

        // The envelope should have our ID.
        assert_eq!(outgoing.envelope.id, "guid");

        let outgoing_payload =
            serde_json::from_str::<serde_json::Value>(&outgoing.payload).unwrap();
        let outgoing_map = outgoing_payload.as_object().unwrap();

        assert!(outgoing_map.contains_key("id"));
        assert!(outgoing_map.contains_key("data"));
        assert!(outgoing_map.contains_key("extId"));
        assert_eq!(outgoing_map.len(), 3);
    }
}

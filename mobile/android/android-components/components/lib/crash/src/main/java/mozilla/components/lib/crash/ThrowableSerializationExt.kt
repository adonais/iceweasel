/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

package mozilla.components.lib.crash

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.NotSerializableException
import java.io.ObjectInputStream
import java.io.ObjectOutputStream
import mozilla.components.lib.crash.db.forceSerializable

internal fun Throwable.serialize(): ByteArray {
    return try {
        val byteArrayOutputStream = ByteArrayOutputStream()
        ObjectOutputStream(byteArrayOutputStream).use { oos ->
            oos.writeObject(this)
        }
        byteArrayOutputStream.toByteArray()
    } catch (e: NotSerializableException) {
        // If throwable isn't serializable, then use a placeholder Throwable with
        // the same stack and include basic name / message data. This gives us
        // at least some data to understand these crashes in the wild.

        this.forceSerializable().serialize()
    }
}

internal fun ByteArray.deserializeThrowable(): Throwable {
    val byteArrayInputStream = ByteArrayInputStream(this)
    val throwable =
        ObjectInputStream(byteArrayInputStream).use { ois ->
            ois.readObject()
        }
    return throwable as Throwable
}

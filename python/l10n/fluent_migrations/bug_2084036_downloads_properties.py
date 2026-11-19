# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migrate.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.migrate.transforms import REPLACE
import fluent.syntax.ast as FTL


def migrate(ctx):
    """Bug 2084036 - Migrate downloads.properties to Fluent, part {index}."""

    source = "browser/chrome/browser/downloads/downloads.properties"
    target = "browser/browser/downloads.ftl"

    ctx.add_transforms(
        target,
        target,
        transforms_from(
            """
downloads-state-starting = {COPY(from_path, "stateStarting")}
downloads-state-failed = {COPY(from_path, "stateFailed")}
downloads-state-paused = {COPY(from_path, "statePaused")}
downloads-state-canceled = {COPY(from_path, "stateCanceled")}
downloads-state-completed = {COPY(from_path, "stateCompleted")}
downloads-state-blocked-parental-controls = {COPY(from_path, "stateBlockedParentalControls")}
downloads-blocked-malware = {COPY(from_path, "blockedMalware")}
downloads-blocked-potentially-unwanted = {COPY(from_path, "blockedPotentiallyUnwanted")}
downloads-blocked-potentially-insecure = {COPY(from_path, "blockedPotentiallyInsecure")}
downloads-blocked-uncommon = {COPY(from_path, "blockedUncommon2")}
downloads-blocked-by-content-analysis = {COPY(from_path, "blockedByContentAnalysis")}
downloads-warned-by-content-analysis = {COPY(from_path, "warnedByContentAnalysis")}
downloads-file-moved-or-missing = {COPY(from_path, "fileMovedOrMissing")}
downloads-file-deleted = {COPY(from_path, "fileDeleted")}
downloads-file-blocked-and-deleted = {COPY(from_path, "fileBlockedAndDeleted")}
downloads-unblock-header-unblock = {COPY(from_path, "unblockHeaderUnblock")}
downloads-unblock-header-open = {COPY(from_path, "unblockHeaderOpen")}
downloads-unblock-type-malware = {COPY(from_path, "unblockTypeMalware")}
downloads-unblock-type-potentially-unwanted = {COPY(from_path, "unblockTypePotentiallyUnwanted2")}
downloads-unblock-type-content-analysis-warn = {COPY(from_path, "unblockTypeContentAnalysisWarn")}
downloads-unblock-type-uncommon = {COPY(from_path, "unblockTypeUncommon2")}
downloads-unblock-insecure = {COPY(from_path, "unblockInsecure2")}
downloads-unblock-tip = {COPY(from_path, "unblockTip2")}
downloads-unblock-content-analysis-warn-tip = {COPY(from_path, "unblockContentAnalysisWarnTip")}
downloads-unblock-content-analysis-blocked = {COPY(from_path, "unblockContentAnalysis1")}
downloads-unblock-content-analysis-override = {COPY(from_path, "unblockContentAnalysis2")}
downloads-unblock-content-analysis-tip = {COPY(from_path, "unblockContentAnalysisTip")}
downloads-unblock-button-open =
    .label = {COPY(from_path, "unblockButtonOpen")}
downloads-unblock-button-unblock =
    .label = {COPY(from_path, "unblockButtonUnblock")}
downloads-unblock-button-confirm-block =
    .label = {COPY(from_path, "unblockButtonConfirmBlock")}
downloads-size-unknown = {COPY(from_path, "sizeUnknown")}
""",
            from_path=source,
        ),
    )

    agent = {"%1$S": VARIABLE_REFERENCE("agent")}
    start_end = {
        "%1$S": VARIABLE_REFERENCE("start"),
        "%2$S": VARIABLE_REFERENCE("end"),
    }
    ctx.add_transforms(
        target,
        target,
        [
            FTL.Message(
                id=FTL.Identifier(id),
                value=REPLACE(source, key, replacements),
            )
            for id, key, replacements in (
                (
                    "downloads-content-analysis-no-agent-error",
                    "contentAnalysisNoAgentError",
                    agent,
                ),
                (
                    "downloads-content-analysis-invalid-agent-signature-error",
                    "contentAnalysisInvalidAgentSignatureError",
                    agent,
                ),
                (
                    "downloads-content-analysis-unspecified-error",
                    "contentAnalysisUnspecifiedError",
                    agent,
                ),
                (
                    "downloads-content-analysis-timeout-error",
                    "contentAnalysisTimeoutError",
                    agent,
                ),
                (
                    "downloads-size-with-units",
                    "sizeWithUnits",
                    {
                        "%1$S": VARIABLE_REFERENCE("size"),
                        "%2$S": VARIABLE_REFERENCE("unit"),
                    },
                ),
                ("downloads-status-separator", "statusSeparator", start_end),
                (
                    "downloads-status-separator-before-number",
                    "statusSeparatorBeforeNumber",
                    start_end,
                ),
            )
        ],
    )

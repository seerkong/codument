# Design

`src/templates/**` remains release truth. Upgrade first backs up then migrates old workspace paths/configuration and removes deprecated paths only after replacement installation. Actions own action-specific procedure; shared protocol/method/spec content is linked, not copied.

# Design

The tests create isolated workspaces and invoke the CLI. They assert the installed filesystem state, not merely the template manifest. Repository E2E helpers remain scripts invoked by tests; they are not distributed agent skills.

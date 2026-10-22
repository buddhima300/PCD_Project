# Equipment inventory

Equipment opens the asset inventory directly. The table contains Pool, Workstation, Laptop model and Current user, in that order. Workstation Pools and Incidents are removed from equipment navigation; their old routes redirect to Equipment.

Inventory rows are generated from the saved platform department capacities loaded from PostgreSQL on each request. For example, GS: 1, DP: 5 and WD: 5 produces 11 workstations, named WS-KANE13-GS01, WS-KANE13-DP01 through DP05, and WS-KANE13-WD01 through WD05. Capacity increases and decreases immediately change this projection without creating fictional laptop records or deleting physical asset history. Existing occupied-seat capacity checks remain in force.

Device links accept both historical WS-KANE13-DP-01 and compact WS-KANE13-DP01 identifiers. Seats without a registered laptop show that explicitly and have no current user. Inactive and setup platforms retain their configured seats.

Search, category/platform/department filters, 25-row pagination and row density controls remain available. Queries refresh every 15 seconds and platform saves invalidate cached queries. Selecting a row by mouse or Enter fetches its current workstation and linked laptop record. The right panel displays device details, current custody and recorded device activity, with loading, retry and removed-seat errors. Empty seats open the same panel without invented hardware or history. Full laptop records remain accessible for seats with devices.

The listWorkstations and getWorkstation operations use the existing server domain runtime hydrated from PostgreSQL, with supervisor authorization. No additional database migration is needed: saved platform capacity is the workstation source of truth.

Empty-seat panels retain device registration. Registration targets the selected workstation and rejects a seat that has since been removed or already has a device.

Supervisors can edit a registered device’s laptop model directly in the inventory table. The dropdown includes existing device models and saved catalogue entries. “Add new laptop model” saves a trimmed model name (up to 100 characters) and applies it to the selected device. Names are reused case-insensitively. The catalogue is persisted in ops_state; changes to device models are stored in ops_laptops and audited. Updates check the previously displayed model to reject concurrent edits. Empty seats require device registration before a model can be edited.

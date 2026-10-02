# Domain language

- **Property**: a cadastral parcel, building, or building part, identified within a cadastral municipality (KO).
- **Property identity**: kind + KO + number, plus part number for building parts. Parcel numbers retain slash notation. Existing persisted identity strings must remain stable.
- **Extract**: a parsed land-registry PDF. A building view includes extracts for the building and its parts, never a same-number parcel.
- **Selection**: the property, manager portfolio or drawn area currently being explored; distinct from the extract list.
- **Published KO dataset**: downloadable valuations or ETN records partitioned by cadastral municipality; replaceable cache, not user-authored data.

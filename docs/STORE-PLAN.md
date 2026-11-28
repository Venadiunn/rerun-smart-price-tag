# How ReRun models a supermarket floor

Store locations distinguishes catalog variants, physical units, and shelf positions. The floor plan uses estimated area for the department blocks. Choose a block to see its aisles and display runs. At narrow widths, the department key shows the full labels and counts without changing the relative block sizes. Choose an aisle to see modeled product addresses. Capacity grid shows the configured storage groups that staff use to reserve and confirm stock. A storage group can cover multiple fixtures and their backstock.

## Research and assumptions

- FMI's 2025 figures give a reference store size of 42,272 sq ft and 33,248 items carried. ReRun has 33,248 catalog variants. Its roughly 779,000 physical units are the demonstration's inventory scenario. [FMI Food Industry Facts](https://www.fmi.org/our-research/food-industry-facts)
- Shelf-space research sizes capacity from facings, package dimensions, shelf depth and shelf levels. Backroom inventory supports replenishment once the display capacity is used. [Shelf space dimensioning and product allocation in retail stores](https://doi.org/10.1016/j.ejor.2020.10.030), [Effect of replenishment and backroom on retail shelf-space planning](https://link.springer.com/article/10.1007/s40685-016-0043-6)
- Four-foot fixture sections are an available retail shelving size. ReRun assumes 44 inches of usable width per 48-inch section, plus a 7-ft circulation allowance and 12 ft of end clearance per run. The dimensions below are scenario inputs for a demonstration floor. [Lozier gondola catalog](https://www.lozier.com/wp-content/uploads/Catalog/Lozier-Catalog.pdf)

| Department                     | Shelves × stocked sides | Shelf depth | Representative retail package (W × D × H) | Facings per SKU | Maximum bays per run | Backroom pallet tiers |
| ------------------------------ | ----------------------: | ----------: | ----------------------------------------- | --------------: | -------------------: | --------------------: |
| Dry grocery and snacks         |                   6 × 2 |       22 in | 3.25 × 3.5 × 6.5 in                       |               1 |                   12 |                     3 |
| Household, health and beauty   |                   6 × 2 |       22 in | 4 × 4.5 × 7 in                            |               1 |                   10 |                     3 |
| Beverages                      |                   5 × 2 |       24 in | 4.5 × 6 × 8 in                            |               2 |                   10 |                     3 |
| Dairy and refrigerated         |                   5 × 1 |       26 in | 4 × 4.5 × 6.5 in                          |               1 |                   12 |                     2 |
| Frozen                         |                   5 × 1 |       26 in | 5 × 5 × 7 in                              |               1 |                   12 |                     2 |
| Produce and floral             |                   3 × 2 |       30 in | 6 × 5 × 5 in                              |               1 |                    8 |                     2 |
| Meat, seafood, deli and bakery |                   4 × 1 |       28 in | 5 × 5 × 4 in                              |               1 |                   10 |                     2 |

## Calculation

1. Divide usable shelf width by package width times the number of facings, rounding down. Multiply by shelf levels and stocked sides to get the variant capacity of a bay. Assign catalog variants in product-ID order and round up the last bay and run as needed.
2. Divide shelf depth by package depth, rounding down, then multiply by facings to get shelf positions for each variant. Allocate recorded placed units up to those positions. Treat the remaining placed units, including units in overflow departments, as estimated backstock. Count units with no confirmed placement separately. Shelf stock, backstock and units awaiting placement reconcile to on-hand units.
3. Size each department block from the sum of its fixture runs and circulation allowances. For backroom space, use configured unit slots minus the planned shelf positions. Assume a 40-by-48-inch pallet with 60 inches of usable height at 70% packing density, department-specific rack tiers, and 45% of backroom floor area under racks. Include a checkout allowance of 12% of modeled department area.

For Beverages, four variants fit each shelf face at two facings per variant. Five levels and two stocked sides yield 40 variants per four-foot bay. The department's 4,655 variants use 117 bays over 12 runs. Two facings at four units deep provide eight shelf positions per variant, or 37,240 positions for the department. For the generated opening stock of 162,876 units, the estimate is 37,240 on shelves and 125,636 in backstock.

The current seven-department catalog models 44 aisle and display runs and 435 four-foot bays. An aisle address describes the assortment plan. Stock movements, existing QR identifiers, historical scan records, configured unit slots, and auto-sort all use their existing database identifiers.

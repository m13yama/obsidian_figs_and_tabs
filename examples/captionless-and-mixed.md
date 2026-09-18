# Captionless and mixed content

## Captionless tables side by side

Columns are sized to their content and centered as a group. Use `lgap` for horizontal spacing and `vgap` for vertical spacing.

> [!grid|cols=2 lgap=32 vgap=16]
> | Diameter | Ampacity |
> | -------- | -------- |
> | 1.6 mm   | 27 A     |
> | 2.0 mm   | 35 A     |
> | 2.6 mm   | 48 A     |
> | 3.2 mm   | 62 A     |
>
>| Area    | Ampacity |
>| ------- | -------- |
>| 2.0 mm² | 27 A     |
>| 3.5 mm² | 37 A     |
>| 5.5 mm² | 49 A     |
>| 8.0 mm² | 61 A     |

## Mixing tables and images with and without captions

> [!grid|cols=2 lgap=24 vgap=32]
> | Diameter | Ampacity |
> | --- | --- |
> | 1.6 mm | 27 A |
> | 2.0 mm | 35 A |
>
> > [!table] Cross-sectional area and ampacity
> > | Area | Ampacity |
> > | --- | --- |
> > | 2.0 mm² | 27 A |
> > | 3.5 mm² | 37 A |
>
> ![[example-apparatus.svg]]
>
> > [!figure] Measurement results
> > ![[example-results.svg]]
>
> Explanatory text occupies a full row.

This paragraph is outside the grid.

## Captionless images side by side

> [!grid|cols=2]
> ![[example-apparatus.svg]]
>
> ![Measurement results](example-results.svg)

## Explicit image widths

> [!grid|cols=2 lgap=24 vgap=16]
> ![[example-apparatus.svg|180]]
>
> > [!figure] Measurement results
> > ![[example-results.svg|300]]

# Figures and grids

Copy this note and both SVG files into the same vault to try the examples.

## Standalone figure

> [!figure] Experimental apparatus. A signal travels from the **sample** to the detector.
> ![[example-apparatus.svg]]

## Standalone table

> [!table] Accuracy by method
> | Method | Accuracy |
> | --- | ---: |
> | A | 92.1% |
> | B | 95.3% |

## Figure and table side by side

> [!grid|cols=2 lgap=16 vgap=16]
> > [!figure] Experimental apparatus
> > ![[example-apparatus.svg]]
>
> > [!table] Measurement conditions
> > | Item | Value |
> > | --- | --- |
> > | Temperature | 25°C |
> > | Repetitions | 10 |
>
> > [!figure|span=2] Reading over time (spanning both columns)
> > ![[example-results.svg]]

This paragraph is outside the grid. A blank line without `>` ends the grid.

## 2×2 layout

> [!grid|cols=2 lgap=24 vgap=24]
> > [!figure] Condition A
> > ![[example-apparatus.svg]]
>
> > [!figure] Condition B
> > ![[example-results.svg]]
>
> > [!figure] Condition C
> > ![[example-results.svg]]
>
> > [!table|caption=bottom] Condition D (caption below)
> > | Condition | Reading |
> > | --- | ---: |
> > | D | 42 |

## Individual overrides

> [!figure|caption=top] Caption above the figure
> ![[example-apparatus.svg]]

## Invalid option fallback

In the following grid, `cols=99` is invalid, so the default column count from the settings is used. Both `lgap=8` and `vgap=8` are valid.

> [!grid|cols=99 lgap=8 vgap=8]
> > [!figure] A
> > ![[example-apparatus.svg]]
>
> > [!figure|span=6] B (span clamped to the actual column count)
> > ![[example-results.svg]]

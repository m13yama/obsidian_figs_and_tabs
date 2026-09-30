# Mermaid figures and grids

Copy this note and `example-mermaid.md` into the same vault. The mixed example also uses `example-apparatus.svg`.

## Inline diagrams, with and without captions

> [!grid|cols=2 lgap=24 vgap=16]
> ```mermaid
> graph LR
>   A[Input] --> B[Output]
> ```
>
> > [!figure|width=300] Processing flow
> > ```mermaid
> > graph TD
> >   A[Read] --> B[Process] --> C[Save]
> > ```

## Reusable diagrams with Obsidian-style widths

`![[example-mermaid|300]]` sets the diagram width to 300 pixels. A block embed can have a different width, even when it refers to the same diagram. Keep the leading `!` to embed the diagram.

> [!grid|cols=2 lgap=24 vgap=16]
> ![[example-mermaid|300]]
>
> > [!figure] The same diagram at 450px
> > ![[example-mermaid#^flow|450]]

## Mixed diagrams, images, and tables

> [!grid|cols=2 lgap=24 vgap=16]
> ![[example-mermaid#^flow|300]]
>
> ![[example-apparatus.svg|240]]
>
> | Stage | Result |
> | --- | --- |
> | Input | Raw data |
> | Output | Processed data |
>
> > [!figure|width=240] Validation
> > ```mermaid
> > graph LR
> >   A[Data] --> B{Valid?}
> >   B -->|Yes| C[Save]
> >   B -->|No| D[Review]
> > ```

## Standalone figure

> [!figure] A reusable diagram
> ![[example-mermaid|400]]

Mermaid keeps its aspect ratio. Standalone figures shrink to fit the pane; grids retain their columns and scroll horizontally when needed.

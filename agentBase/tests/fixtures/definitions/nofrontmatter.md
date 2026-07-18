This is an agent definition without YAML frontmatter.

The parser should extract the name from the filename (nofrontmatter) and leave the description empty, using only the file content as the body.

This edge case tests the parseDefinition function's handling of markdown files that contain no frontmatter at all.

The body text can be quite long if needed, and should still parse correctly.

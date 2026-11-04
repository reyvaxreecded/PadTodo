import type { Section } from '../shared/models';

export interface SectionNode extends Section {
  children: SectionNode[];
}

/** A heading belongs to the nearest preceding heading with a lower level. */
export function sectionTree(sections: readonly Section[]): SectionNode[] {
  const roots: SectionNode[] = [];
  const stack: SectionNode[] = [];
  for (const section of sections) {
    while (stack.length && stack[stack.length - 1]!.level >= section.level) stack.pop();
    const node = { ...section, children: [] };
    (stack[stack.length - 1]?.children ?? roots).push(node);
    stack.push(node);
  }
  return roots;
}

export function flattenSections(nodes: readonly SectionNode[]): Section[] {
  return nodes.flatMap(({ children, ...section }) => [section, ...flattenSections(children)]);
}

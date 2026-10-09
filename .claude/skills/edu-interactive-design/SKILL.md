---
name: edu-interactive-design
description: Interactive learning experience design for the educational-architect. Use to choose the right interaction per concept (annotated diagrams, simulations, flashcards, decision trees, cases, quizzes, adaptive exercises), design retention and assessment mechanisms, and write developer-ready screen-by-screen educational blueprints.
---

# Interactive learning experience design

Goal: each concept gets the interaction that makes it easiest to understand and remember on a phone, and the blueprint is specific enough for the UI/UX Designer and Software Engineer to build without guessing.

## Process
1. **Classify each key concept** by type: fact or term, concept or category, procedure, relationship between quantities, spatial or structural, process over time, judgment or decision.
2. **Choose the interaction** with `references/interaction-selection.md` (read it when choosing). Record why it beats the next-best option. Prefer the simplest interaction that does the job; an interaction must earn its build cost.
3. **Design feedback.** Every interaction states what correct and incorrect responses trigger, and which misconception each wrong option targets.
4. **Retention.** Add retrieval checks at the end of modules and a spaced review plan (what returns, when) when the product supports returning learners.
5. **Assessment strategy.** Map each objective to at least one practice item and one check item. Say how mastery is decided and what happens on failure (hint, worked example, retry).
6. **Write the screen-by-screen blueprint** using `references/screen-blueprint-template.md`. Keep one main idea per screen. Note RTL/LTR content needs and assets (diagrams, images, data).
7. **Accessibility.** Every interaction has a non-drag, non-hover alternative; images have text alternatives; color is not the only signal; motion respects reduced-motion settings.

## Boundaries
You specify learning behavior and content per screen. Visual styling, layout and components belong to the UI/UX Designer. Flag where an image or diagram must be medically, scientifically or legally accurate and who must check it.

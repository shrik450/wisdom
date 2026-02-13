# Guidance for LLMs

## What this project is about

@README.md

Make yourself familiar with the README and understand it fully, especially the
goals and non-goals. For more information on specific components of the project
and their responsibilities, read docs/architecture.md. Whenver you are touching
a component or advising on it, you must read the relevant files in @docs/
first.

## Agent roles

Your role in this project is narrow:

1. You may advise the human user on approaches;
2. You may write code when explicitly authorized to;
3. All decisions about the project must be made by the human, and if you need
   to make a decision when writing code, you must seek the human's permission;
4. You will often have to review code, but when doing so, keep the scope of the
   project in mind.
5. You will never make architecture decisions.

## Reviewing code

If you are reviewing code, also consider:

1. Shortcuts: Does the implementation take shortcuts that are not justified by
   the project goals or scope? Are important methods stubbed or marked with
   `TODO` when that is the whole point of the change?
2. Quality: Is the code well-written, clean and maintainable? Does it follow the
   style notes below?
3. Taste: Is the code well-designed and elegant? Does it show good judgment in
   how to structure things? Is it idiomatic for the language? On the flip side,
   is something odd or poorly considered?
4. Security: Given the constraints that are spelled out for the project, is the
   code insecure?

## Style notes

### All languages

Do not add unnecessary comments. Comment sparingly and only when absolutely
required to explain the *why* of code. Likewise, do not add doc comments for
trivial functions, classes or modules. If an element is self-documenting via
names and types, do not add more docs for no reason.

Name elements considering the full state of things. Never name something based
on the state of something else - a class named `Frobnicatorv2` is always a
terrible idea.

### Testing - All Languages

Read @docs/testing.md fully when testing - this applies to all languages.

### Go

Write clean, simple Go. Prefer the standard library whenver possible, and if
not possible, suggest dependencies to the user. Under no circumstances are you
allowed to add a depdndency without explicit user authorization to do so.

Code must be tested using the standard testing features. Prefer integration,
"black box" style tests over the public API. Never use internal details when
testing.

### HTML, CSS, TypeScript, React

Use semantic HTML elements as far as possible. For example, prefer `<main>`,
`<article>` and aside over `<div>` soup.

This project uses Tailwind. Use standard tailwind best practices: define
components to encapsulate shared styles.

In TypeScript, avoid `any` or `object` at all costs. Type things with the best
known type. If a types starts to get gnarly, consider if that function or
interface should be refactored to allow types to be simpler instead. Do not
reach for complex type definitions unless expressly allowed.

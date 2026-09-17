# Architecture Decision Records

The decisions the framework is built on. New ADRs get the next number; superseded ADRs are marked, never deleted.

| #                                                          | Decision                                                                                                | Status                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------- |
| [0001](0001-category-and-positioning.md)                   | Application framework/platform, not a starter kit; developed in public                                  | Accepted                   |
| [0002](0002-product-ownership.md)                          | Consumer app is owned source; admin console is Intelligo-owned                                          | Accepted                   |
| [0003](0003-ai-framework-boundary.md)                      | AI frameworks stay native; Intelligo records only the execution boundary                                | Accepted                   |
| [0004](0004-database-ownership.md)                         | One PostgreSQL database, explicit per-table ownership                                                   | Accepted                   |
| [0005](0005-transport-and-composition.md)                  | One service layer behind two transports; one composition root                                           | Accepted                   |
| [0006](0006-package-allowlist.md)                          | Public / private / undecided package allowlists                                                         | Superseded in part by 0011 |
| [0007](0007-execution-boundary.md)                         | The execution boundary is a lifecycle with ports, not a wrapper                                         | Accepted                   |
| [0008](0008-dissolving-the-undecided-packages.md)          | `agents`, `ai` and `chat` dissolve; none is published                                                   | Amended in part by 0012    |
| [0009](0009-public-conversation-and-document-contracts.md) | Conversation and document persistence are public `core` capabilities                                    | Accepted                   |
| [0010](0010-registry-i18n-standard.md)                     | Registry items are i18n-native (next-intl); consumers install them unmodified                           | Accepted                   |
| [0011](0011-package-topology.md)                           | One package per runtime target; shared types are subpaths; the registry is a private workspace          | Accepted                   |
| [0012](0012-headless-chat-transport.md)                    | The chat transport is a package; the chat UI is registry source                                         | Accepted                   |
| [0013](0013-design-system.md)                              | One design system: shadcn base-nova, an additive token contract, a tiered catalog                       | Accepted                   |
| [0014](0014-chat-extension-contract.md)                    | One runtime seam (`streamTurn`), consumer-owned runtime bindings, the tool renderer and canvas contract | Amended in part by 0016    |
| [0015](0015-money-is-micros-with-a-currency.md)            | Money is micros with a currency attached; a deployment declares the one it bills in                     | Accepted                   |
| [0016](0016-chat-generation-options.md)                    | The transport passes a typed allowlist of settlement-neutral generation options                         | Accepted                   |

The ADRs were written inside the private repository these packages were extracted from (ADR-0001, ADR-0006); references to internal planning documents have been removed. The decisions themselves are complete as written.

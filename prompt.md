# FORK — Autonomous Product Development Specification

## YOUR ROLE

You are an autonomous, senior-level product engineering and design agent responsible for building **FORK**, an exceptionally polished, interactive, AI-powered multiverse exploration platform.

You are acting simultaneously as:

- A principal product designer with exceptional visual taste.
- A senior frontend engineer specializing in complex interactive interfaces.
- A creative developer specializing in motion design, physics, and spatial interfaces.
- A full-stack engineer capable of building production-quality APIs and data infrastructure.
- An AI engineer responsible for multi-model scenario analysis.
- A blockchain engineer familiar with Solana.
- A quality assurance engineer responsible for thoroughly testing the final application.

**Your responsibility is to build the application, not merely describe how it should be built.**

Work autonomously through implementation, testing, visual refinement, and documentation. Do not stop after creating a scaffold, an initial UI, or a proof of concept.

Do not repeatedly ask for approval over ordinary implementation decisions. Make sensible decisions independently, document them, and continue.

If external credentials or services are unavailable, implement robust adapters and clearly labeled demonstration fallbacks so the application remains fully explorable.

Only stop when you have completed the implementation to the greatest extent supported by the available environment, run the available tests, and documented any remaining limitations.

**The highest priority is visual excellence combined with a genuinely compelling interactive experience.**

This must not look like a generic AI-generated website.

---

# 1. PRODUCT VISION

## What is FORK?

**FORK is an interactive multiverse engine that allows users to construct hypothetical worlds, explore how events affect one another, and navigate increasingly deep layers of possible futures.**

Users begin by selecting a target event or prediction market whose probability they want to investigate.

They then create a **basket of hypothetical events**, choosing an assumed resolution for each event.

For example:

**Target market:**

Will Bitcoin exceed $150,000 by December 2027?

**Hypothetical event basket:**

- Federal Reserve cuts interest rates: YES
- Major cryptocurrency ETF receives approval: YES
- United States enters a recession: NO
- Major cryptocurrency exchange collapses: NO

The user is effectively declaring:

"Imagine a world in which all these assumptions are true."

FORK uses a multi-model research and forecasting engine to analyze this hypothetical world and estimate how the probability of the target event changes.

It then creates a new **Verse**: a distinct hypothetical universe containing the assumptions, model estimates, relevant evidence, and relationships between events.

The user can enter that Verse, explore its consequences, add more assumptions, and fork into increasingly deep alternate futures.

The result is an interconnected, navigable graph of possible worlds.

## The core philosophical idea

FORK should make exploring the future feel spatial, tangible, and interactive.

Traditional prediction market applications show lists, probabilities, and charts.

Traditional AI systems respond with paragraphs.

**FORK allows users to manipulate hypothetical reality.**

They construct assumptions, generate alternate universes, watch probabilities shift, explore disagreement between models, and navigate the consequences.

It should feel like exploring an intelligent, living map of possible futures.

## The central product loop

1. Select a target event or prediction market.
2. Discover other potentially relevant events.
3. Drag events into a basket.
4. Choose the hypothetical outcome of each event.
5. Trigger a Fork.
6. Experience a cinematic transition into a new Verse.
7. Inspect conditional forecasts, explanations, and model disagreement.
8. Name, save, and explore that Verse.
9. Add more assumptions and create another Fork.
10. Navigate between alternate histories and compare them.

This must feel fluid, not like filling out a form.

---

# 2. PRODUCT PRIORITIES

In descending order:

**Priority 1 — Exceptional UI and visual experience**

The application should look like it was designed by an elite digital product studio.

**Priority 2 — Exceptional interaction design**

Dragging, selecting, exploring, entering new Verses, and comparing universes must feel unusually satisfying.

**Priority 3 — A complete, coherent user journey**

A user must be able to understand and experience the entire product without encountering unfinished screens.

**Priority 4 — Working scenario generation**

Use a multi-model orchestration engine when configured, supported by research and structured probability estimates.

**Priority 5 — Genuine prediction market integration**

Fetch real event information and available market data using Gemini's official API.

**Priority 6 — Solana integration**

Provide a meaningful blockchain foundation, without compromising the primary experience.

Do not sacrifice the core visual experience to prematurely implement advanced blockchain functionality.

However, do not describe an offchain demonstration as an operational onchain product.

---

# 3. AESTHETIC DIRECTION

## The desired feeling

The product should feel like a hybrid of:

- Apple's most sophisticated spatial interfaces.
- Linear's density, restraint, and attention to detail.
- Vercel's typography and technical sophistication.
- A high-end scientific visualization application.
- An interactive cinematic representation of a multiverse.

The result should be minimal, futuristic, intelligent, and extremely refined.

**Think: a beautifully engineered instrument for exploring possible realities.**

Not a crypto dashboard.

Not a gaming website.

Not a landing page filled with oversized cards.

Not a generic SaaS template.

Not a cyberpunk casino.

Not a conventional AI chat interface.

## Overall visual design

The interface must be predominantly black.

Use a carefully controlled dark palette:

- Main background: near-black, approximately #050505.
- Secondary surfaces: approximately #0D0D0F.
- Elevated panels: approximately #111114.
- Primary text: near-white.
- Secondary text: restrained neutral gray.
- Borders: extremely subtle white transparency.
- Accent: one carefully selected cool tone, such as icy cyan, ultraviolet, or a restrained teal.

Avoid displaying numerous saturated colors simultaneously.

Use color intentionally to communicate:

- Selected states.
- Active relationships.
- Probability changes.
- Positive versus negative forecast movement.
- Active model analysis.
- Currently selected Verse.

The graph should provide most of the color and visual interest.

## Important design restrictions

Absolutely avoid the following:

- Generic gradient backgrounds.
- Giant purple glowing blobs.
- Excessive glassmorphism.
- Every component having rounded-xl corners.
- Heavy neon outlines on every card.
- Default Tailwind-style dashboard layouts.
- Excessive emoji.
- Randomly placed decorative icons.
- Fake analytics charts.
- Gratuitous loading skeletons.
- Inconsistent spacing.
- Oversized typography without purpose.
- Uneven card dimensions.
- Excessively wide empty margins.
- A basic sidebar combined with a generic card grid.
- Unnecessary "AI-powered" labels everywhere.
- Generic stock photos.
- Overly playful animations.
- Fake data presented as live.
- Components that look assembled from unrelated UI kits.

The application should feel deliberately art-directed.

Every visual element needs a reason to exist.

## Typography

Choose a genuinely high-quality, freely usable typeface.

Research suitable fonts from legitimate sources such as Google Fonts.

Potential choices include:

- Geist
- Inter
- Manrope
- IBM Plex Mono for technical metadata

Verify the font's license before incorporating it.

Prefer a restrained pairing:

- One primary sans-serif family.
- One monospace family for percentages, contract identifiers, and technical information.

Typography should be precise.

Use consistent weights, tracking, and line heights.

Important numerical values should use tabular numerals to avoid shifting during animated updates.

The interface should remain legible during complex visual interactions.

---

# 4. EXTERNAL VISUAL ASSETS

## Critical instruction

**Do not invent or draw replacement UI icons. Use professionally designed, existing, freely licensed icon assets from reputable libraries.**

Use an established icon family consistently.

Approved starting points:

Lucide:
https://lucide.dev/

Phosphor Icons:
https://phosphoricons.com/

Use one as the primary icon family, rather than randomly mixing icon styles.

Verify licensing and preserve required notices.

Use actual icon package imports or properly licensed SVG assets.

Do not use emoji as interface icons.

Do not generate icons using AI.

Do not construct crude icon approximations using CSS, Unicode characters, or arbitrary shapes.

For fonts and any additional visual assets, research reputable free resources and check their licensing.

**Exception:** The multiverse graph, node geometry, edges, particle systems, animated connections, probability displays, and transition effects are bespoke interactive visualizations. These should be implemented using code because their behavior is intrinsic to the product.

They are not generic decorative icons.

Do not use stock photography for the main interface.

Do not add imagery merely to fill space.

---

# 5. RECOMMENDED TECHNICAL STACK

Use TypeScript throughout where practical.

## Frontend

- Next.js with App Router.
- React.
- TypeScript.
- Tailwind CSS for design-system styling.
- Motion for React for interface transitions, spring animations, gestures, and layout animation.
- React Flow / XYFlow as a possible base for the interactive graph.
- Zustand for focused interactive state management.
- TanStack Query for asynchronous remote data.
- A professionally implemented headless component system for accessible dialogs, menus, and popovers.

## Graph implementation

Investigate React Flow:

https://reactflow.dev/

However, do not blindly accept its default appearance.

Default React Flow nodes, handles, controls, and edges are visually insufficient for this product.

Build completely custom node components, edge styles, control surfaces, and camera transitions.

If a bespoke graph renderer would produce a materially better result, use Canvas or WebGL for the rendering layer.

Do not introduce WebGL just for novelty.

Prefer performant, comprehensible engineering.

## Motion

Use:

https://motion.dev/docs/react

For more elaborate choreography, investigate GSAP's appropriately licensed core features if justified.

Avoid conflicts between multiple animation systems.

Make animations interruptible and responsive to navigation changes.

## Backend

Use whichever of the following best matches the repository:

- Next.js server routes.
- A small Python FastAPI forecasting service, if it materially simplifies model orchestration.
- A lightweight persistence layer using SQLite during development or PostgreSQL when available.

Do not introduce unnecessary microservices.

## Blockchain

Target Solana devnet for the initial implementation.

Use maintained official Solana tooling and current wallet libraries, verifying package compatibility before installation.

Use Anchor and Rust if implementing the custom Solana program.

Do not invent blockchain functionality or claim that an interaction is onchain if it is not.

---

# 6. INFORMATION ARCHITECTURE

FORK should behave like a single immersive application with several distinct states.

The primary application states are:

1. Universe initialization.
2. Target selection.
3. Event discovery.
4. Basket construction.
5. Fork execution.
6. Verse arrival.
7. Verse exploration.
8. Deeper forking.
9. Universe navigation.
10. Verse comparison.

Avoid creating separate conventional pages for every state.

The transition between these states should feel continuous.

The graph remains the central spatial reference throughout the experience.

---

# 7. FIRST LAUNCH EXPERIENCE

## Initial screen

On first launch, the user should see an extremely clean, nearly black canvas.

The FORK identity should be visually memorable but minimal.

Use a typographic wordmark:

**FORK**

A small, professionally designed branching symbol may accompany the name.

The main screen should contain:

- A central visual focal point.
- A concise headline inviting the user to explore a possible future.
- An elegant market/event search control.
- A few carefully chosen example targets.
- Subtle ambient movement in the background.

Suggested headline:

**Every future begins with a question.**

Suggested supporting copy:

"Choose an event. Change the assumptions. Explore what happens next."

Do not overcrowd this screen.

The graph may appear as a subtle collection of distant nodes, gently moving in the dark.

The environment should feel expansive.

## Entering the application

Selecting a target should transition smoothly into the active multiverse workspace.

Avoid full-page loading screens.

The initial focal point should transform into the main target node.

The surrounding graph should materialize naturally.

---

# 8. THE MAIN WORKSPACE

This is the most important screen in the application.

It should use a full-screen, immersive graph canvas.

## Layout

### Top-left

Minimal FORK wordmark.

A small contextual indicator identifying the current Verse.

A breadcrumb or spatial navigation control showing ancestry.

Example:

ORIGIN / SOFT LANDING / ETF EUPHORIA

### Top-center

A compact, elegant target selector.

The user can change the target market or event.

Show the target's title, source, and baseline probability when available.

### Top-right

Minimal controls for:

- Search.
- Saved Verses.
- Compare Verses.
- View settings.
- Connect wallet, if implemented.

Do not use a full row of large conventional buttons.

### Center

The living multiverse graph.

It should occupy the majority of the viewport.

This is the primary visual experience.

### Left or lower-left

An optional contextual event-discovery panel.

It should remain compact or collapsed until required.

### Right or lower-right

A beautiful floating **Event Basket**.

This should appear as a distinct interactive surface, not a conventional form.

### Bottom

A restrained spatial navigation strip or contextual action bar.

Potential actions:

- Add event.
- Fork this world.
- Compare.
- Return to Origin.

Keep controls contextual.

The screen should feel open, not boxed in by large panels.

---

# 9. THE LIVING GRAPH

## Required behavior

The graph must feel alive.

Nodes should have subtle idle motion.

Edges should respond to movement.

Related nodes should exhibit coherent attraction and repulsion.

The movement should feel physically plausible rather than random.

Use spring-based transitions and carefully tuned easing.

### Node interactions

When hovering over a node:

- The node becomes slightly more prominent.
- Its immediate connections become brighter.
- Unrelated graph regions recede.
- Relevant information appears through a refined tooltip or contextual panel.
- Movement remains subtle.

When dragging a node:

- The node should respond immediately.
- Connected edges should stretch naturally.
- Nearby nodes should react where appropriate.
- Releasing the node should cause a short, satisfying settling animation.

Avoid excessive bouncing.

### Graph navigation

Support:

- Drag-to-pan.
- Scroll-to-zoom.
- Smooth zoom-to-node.
- Fit-to-view.
- Double-click to focus.
- Navigating to a parent Verse.
- Returning to Origin.
- Selecting an alternate branch.
- Keyboard-accessible basic navigation.

The camera movement should be a major part of the experience.

Avoid sudden position jumps.

## Node types

Implement visually differentiated representations for:

**Target Node**

The primary event being forecast.

Should be visually prominent.

**Event Node**

A possible real-world event or market outcome.

**Assumption Node**

An event whose hypothetical resolution the user has selected.

**Verse Node**

A saved hypothetical universe.

**Forecast Node**

A model-generated conditional probability associated with a selected event.

**Disagreement Node**

A significant conflict between model interpretations.

Use subtle variations in shape, size, lighting, and typography rather than assigning every type a completely different color.

## Graph edges

Edges can represent:

- Assumed conditions.
- Conditional dependencies.
- Historical correlations.
- Hypothesized causal relationships.
- Parent-child Verse relationships.
- Contradictions or mutually exclusive outcomes.

Their visual treatment should communicate their meaning.

Do not suggest an established causal relationship when the relationship is only model-inferred.

Provide a subtle way to inspect the relationship type.

---

# 10. EVENT DISCOVERY

Users must be able to select events beyond cryptocurrency.

Possible categories:

- Politics and elections.
- Macroeconomics.
- Cryptocurrency.
- Technology.
- Artificial intelligence.
- Geopolitics.
- Energy.
- Financial markets.
- Custom hypothetical events.

Event selection should feel like browsing a beautiful library of possible futures.

## Search

Provide fast, responsive search.

Search results should display:

- Event title.
- Category.
- Source.
- Resolution date, where applicable.
- Current implied probability, where available.
- Market availability.
- A clear distinction between live market data and a custom event.

Search should support keyboard navigation.

## Event cards or rows

Avoid generic card-grid design.

Use elegantly typeset, compact discovery rows with appropriate metadata.

Hovering should produce restrained motion.

Selecting an event should feel immediate.

## Gemini integration

Use the official Gemini Prediction Markets API:

https://developer.gemini.com/prediction-markets-spec

Retrieve public event definitions and market data using documented endpoints.

Do not assume that authenticated trading endpoints are accessible.

Use server-side adapters where necessary to handle caching, rate limits, and request failures.

Map Gemini contracts into a normalized internal event schema.

Store source identifiers and resolution definitions.

Do not fabricate live market prices.

When unavailable, display a clearly labeled demonstration event dataset.

Custom events must be visually distinguishable from exchange-listed markets.

---

# 11. THE EVENT BASKET

This is one of FORK's signature interactions.

Users create hypothetical worlds by assembling events inside a basket.

## Visual concept

The basket should resemble a premium floating instrument tray.

Not an ecommerce cart.

Not a plain unordered list.

Not a rectangular form with checkboxes.

Think of a compact, sculpted surface that responds dynamically as assumptions are added.

It should feel almost magnetic.

## Adding an event

The user can drag an event from the discovery panel or graph into the basket.

Required animation:

1. The selected event detaches from its original location.
2. It follows the pointer smoothly.
3. The basket reacts as the item approaches.
4. A subtle magnetic attraction effect occurs.
5. The basket expands to accommodate the event.
6. The item settles into place with a satisfying spring animation.
7. The graph subtly acknowledges the new assumption.

Support click-to-add as an accessible alternative.

## Resolving an event

Each basket item must have an assumed resolution.

For binary markets:

YES / NO

For multi-outcome markets:

Display the actual available outcomes.

For custom events:

Support an appropriate explicitly defined outcome set.

The selected resolution should be visually unmistakable.

Avoid large default radio buttons.

Use elegant segmented controls or integrated state selectors.

## Basket interactions

Users can:

- Add events.
- Remove events.
- Change resolutions.
- Reorder events.
- Inspect source details.
- Clear the basket.
- Save a draft basket.
- Fork from the current Verse.

Detect directly contradictory assumptions.

For example, a user should not be able to assert mutually exclusive outcomes for the same precisely defined market without an explicit warning.

The basket should adapt gracefully from one to several assumptions.

For the initial version, support around six to eight events per basket.

---

# 12. THE FORK INTERACTION

**This is the most important animation sequence in the entire product.**

The user has constructed a basket of assumptions.

They are ready to create a new world.

The primary action should be:

**FORK REALITY**

or a similarly distinctive, concise label.

Do not use a generic "Submit" or "Generate" button.

## Animation choreography

When the user activates the Fork:

### Phase 1 — Commitment

The basket visually locks.

Selected events brighten.

A pulse travels through their connections.

The active target node responds.

### Phase 2 — Energy convergence

The selected event nodes visually converge toward the center of the graph.

Existing connections stretch.

The surrounding graph moves slightly inward.

The visual composition builds a sense of tension.

### Phase 3 — Reality transition

The graph undergoes a brief, carefully choreographed transformation.

Possible effects:

- Camera acceleration.
- Radial distortion.
- Subtle screen shake.
- Rapid depth movement.
- Particle convergence.
- Temporary reduction of background detail.
- A controlled flash or luminance pulse.

**Do not make this a cheap screen-shake animation.**

The effect should be cinematic, refined, and technically impressive.

Keep the most intense effects brief.

Do not overload the screen with particle noise.

### Phase 4 — Travel

The camera moves through a stylized network of branching paths.

The current world recedes.

A new focal point emerges.

This should communicate moving between universes.

### Phase 5 — Arrival

The new Verse becomes visible.

The probability display animates from the previous baseline to the new estimated probability.

New nodes appear.

Edges settle into place.

The selected assumptions become part of the Verse's identity.

The environment returns to its calmer ambient state.

### Phase 6 — Reveal

Show the new Verse name or naming interface.

Present the conditional forecast and key changes.

Allow the user to immediately continue exploring.

## Timing

The overall transition should feel substantial without becoming frustrating.

Target approximately two to four seconds for the primary visual choreography, with flexible timing based on actual forecasting latency.

If model analysis takes longer, transition into an elegant active analysis state instead of freezing the experience.

Do not show fake percentages or fabricated model progress.

Do not force users to replay lengthy animations on every navigation action.

Support reduced-motion accessibility preferences.

## Technical implementation

Use a clear animation state machine.

Separate:

- Application state.
- Forecast request state.
- Graph layout state.
- Camera state.
- Transition state.

Ensure rapid clicking does not corrupt the graph or produce overlapping transitions.

---

# 13. VERSES

A **Verse** is a fully defined hypothetical world.

Every Verse should have:

- A unique identifier.
- A name.
- A parent Verse, except Origin.
- Its cumulative inherited assumptions.
- Newly introduced assumptions.
- A target event.
- Its baseline market probability, where available.
- A conditional forecast.
- Individual model estimates.
- Model reasoning.
- Research sources.
- Creation timestamp.
- Child Verses.

## Verse naming

After creating a Verse, users can give it a name.

The interface may suggest evocative names based on assumptions.

Examples:

- Soft Landing
- ETF Euphoria
- Red Winter
- Regulation Shock
- Liquidity Winter
- AI Acceleration
- Fragmented World

The user must be able to edit the name.

Naming should feel like a small, meaningful act of creation.

Do not use a generic browser prompt dialog.

## Verse identity

Each Verse should have a subtle visual identity.

Potential characteristics:

- A restrained accent hue.
- A recognizable node signature.
- A unique location in the graph.
- A small identifier or generation number.

Do not create random visual chaos.

Users should recognize the Verse when returning to it.

## Persistence

Verses should persist across reloads.

Implement local persistence at minimum.

Prefer a server-backed persistence layer if available.

Users should be able to reopen a saved Verse and inspect its original forecast, not silently receive a newly generated answer.

---

# 14. MULTI-LAYER EXPLORATION

FORK must support deep branching.

A user can enter a Verse and create another Verse from it.

Each child inherits its parent's assumptions.

Example:

Origin:

No hypothetical assumptions.

Verse 1:

Federal Reserve cuts rates.

Verse 2:

Federal Reserve cuts rates AND cryptocurrency ETF approved.

Verse 3:

Federal Reserve cuts rates AND ETF approved AND recession avoided.

Verse 4:

Federal Reserve cuts rates AND ETF approved AND recession avoided AND major regulation passes.

The user must be able to navigate backward to any ancestor.

The user must be able to create alternate children from the same parent.

The graph must maintain stable identity for all Verses.

Do not flatten the universe into a chronological list.

## Important UX feature

Allow the user to see the cumulative assumptions defining the currently selected world.

Clearly distinguish:

- Assumptions inherited from earlier forks.
- Assumptions added at the current layer.
- Events the system merely predicts or considers.

A predicted event is not automatically an assumed event.

This distinction is fundamental.

---

# 15. TARGET MARKET SELECTION

The user always has a current target event.

For example:

"Will Bitcoin exceed $150,000 by December 2027?"

The system estimates how likely that target is under the current Verse's assumptions.

Users can switch target events while remaining in a Verse.

For example, from the same hypothetical world, the user might inspect:

- Bitcoin above $150,000.
- Ethereum above $8,000.
- S&P 500 positive for the year.
- A recession occurring.
- A specified AI milestone being reached.

This creates another important capability:

**The same hypothetical world can be examined through multiple target markets.**

The system should reuse relevant existing analysis and research when possible.

Store forecasts by Verse and target event.

Avoid interpreting a forecast for one target as if it automatically applies to another.

---

# 16. PROBABILITY VISUALIZATION

Probabilities are central to FORK's identity.

Their presentation must be exceptionally polished.

## Main forecast display

Show:

- Current market-implied probability, if available.
- Conditional model-estimated probability.
- Difference in percentage points.
- Model disagreement or forecast range.
- Data timestamp.
- Source classification.

Example:

Market baseline: 35%

Conditional model estimate: 61%

Change: +26 percentage points

This must be visually understandable within one second.

## Animated values

Numbers should transition smoothly when new forecasts arrive.

Use tabular numerals.

Do not animate percentages in ways that imply calculation is occurring when it is not.

## Forecast ranges

Show disagreement without pretending that the range represents a statistically calibrated confidence interval.

A min-to-max model range may be used.

Label it accurately.

## Context

Differentiate:

**MARKET**

An observed price-derived estimate.

**MODEL**

An AI-generated conditional forecast.

**DEMO**

Illustrative or simulated data.

These distinctions should remain visually elegant but unmistakable.

---

# 17. MULTI-MODEL FORECASTING ENGINE

Implement an extensible forecasting ensemble.

The desired initial configuration uses four independently generated analyses.

The system should support different model providers when credentials are available.

Do not hardcode secret keys.

Use environment variables and backend-only model calls.

## Model responsibilities

Initially define four analytical roles:

### Model A — Macro / Causal Analyst

Examines plausible economic, political, technological, or causal mechanisms.

Identifies why selected assumptions could affect the target.

### Model B — Historical / Empirical Analyst

Examines historical comparisons, available data, and relevant prior events.

Identifies limits of historical analogies.

### Model C — Market Analyst

Uses current market information, forecasts, pricing, and relevant financial relationships.

Distinguishes observed market data from predictions.

### Model D — Skeptical / Contrarian Analyst

Challenges the other possible narratives independently.

Identifies hidden assumptions, alternative mechanisms, and reasons the forecast may be misleading.

These roles should not be treated as evidence of genuine independence when the underlying models share similar training and data.

## Forecast workflow

### Step 1 — Normalize

Convert the target and basket into a strict structured scenario.

### Step 2 — Research

Collect relevant information from permitted sources.

When web-search capabilities are available, retrieve current material and preserve citations.

Never fabricate research sources.

### Step 3 — Independent analysis

Run model analyses without showing them one another's numerical forecasts.

Each model must return structured output.

### Step 4 — Disagreement analysis

Compare assumptions, estimates, and stated reasoning.

Identify important points of disagreement.

### Step 5 — Optional revision

Provide models with relevant opposing arguments.

Allow them to revise their forecasts.

Do not force agreement.

### Step 6 — Aggregation

Produce a transparent ensemble estimate, such as a weighted or equal-weight mean.

Use weights only when they have a documented basis.

### Step 7 — Validation

Validate numerical bounds, event logic, and structured output.

Reject contradictory or invalid responses.

### Step 8 — Store

Persist the forecast, model outputs, source references, and model configuration.

## Required structured output

Each model should return fields including:

- Target event ID.
- Scenario assumption IDs and resolutions.
- Estimated conditional probability.
- Key assumptions.
- Supporting reasoning.
- Counterarguments.
- Evidence references.
- Missing information.
- Major uncertainties.
- Possible downstream events.
- Suggested high-impact next questions.

Use schema validation, preferably Zod.

Implement retries and partial-failure handling.

If one model fails, do not fabricate its output.

Display a partial ensemble state where appropriate.

---

# 18. AI DISAGREEMENT AS A PRODUCT FEATURE

This is a signature part of FORK.

Imagine three models agree that a target is likely, but another produces a dramatically different estimate.

The application should reveal that disagreement.

The user can click a model's forecast to inspect its assumptions.

Even better:

**Allow users to fork a model disagreement into an alternate Verse.**

Example:

Model A:

"Rate cuts improve liquidity."

Model D:

"Rate cuts signal economic weakness."

The system proposes two different explanatory scenarios.

Users can explore both.

The graph should visually split into alternative paths.

This creates a bridge between model disagreement and multiverse exploration.

The underlying probabilities must remain clearly attributed to their models.

---

# 19. THE MOST IMPORTANT UNKNOWN

Implement a feature called something like:

**Find the next fork**

FORK analyzes the currently selected world and suggests which unresolved question may have the greatest effect on the target forecast.

Example:

"You have assumed that the Fed cuts rates. The reason for those cuts may substantially change the outlook."

It suggests:

- Soft landing.
- Recession-driven cuts.

Clicking the suggestion adds a candidate event to the basket.

This makes the graph feel intelligent.

The user isn't required to know every relevant market in advance.

For the MVP, rank proposed questions using model-estimated differences rather than claiming formally calculated information gain unless that calculation exists.

---

# 20. MARKET MODE

Include a clean switch between:

**EXPLORE**

For general possible-world analysis.

**MARKETS**

For scenarios involving real prediction markets.

## Explore Mode

Supports arbitrary clearly defined events.

Uses AI research, user assumptions, and scenario modeling.

May not have a baseline market probability.

## Markets Mode

Emphasizes market-linked events.

Shows:

- Gemini event source.
- Actual current available pricing.
- Market liquidity context, if available.
- Current observed market estimate.
- Conditional model forecast.
- Forecast difference.
- Related markets.

The entire interface should remain part of the same design system.

Do not build a separate conventional trading dashboard.

---

# 21. COMPARE UNIVERSES

This is another major visual feature.

Users select two saved Verses.

FORK shows them side-by-side or through an elegant split spatial view.

Display:

- Verse names.
- Target market.
- Conditional probability in each Verse.
- Probability difference.
- Shared assumptions.
- Differing assumptions.
- Main reasons for the forecast difference.
- Model disagreement.

The most interesting view would highlight the exact assumptions that caused the worlds to diverge.

Example:

Soft Landing: 72%

Recession Shock: 24%

Difference: 48 percentage points.

The interface should make that difference visually striking.

Do not claim the difference is causally identified merely because the model outputs differ.

---

# 22. SOLANA INTEGRATION

FORK is intended to be built with Solana in mind.

However, don't compromise the primary product to add superficial blockchain functionality.

The long-term product can support financial positions associated with specific future outcomes.

## Proposed feature: FORK Positions

A user selects a precisely defined, verifiable scenario.

They can create or participate in a collateralized conditional position.

The contract manages:

- Collateral.
- Participant ownership.
- Defined payout conditions.
- Valid resolution inputs.
- Settlement.
- Redemption.

## Hackathon scope

If implementing this feature, keep the first version deliberately narrow.

Support:

- Solana devnet.
- A supported test token.
- One or two precisely defined conditions.
- Fully collateralized payout claims.
- A clearly identified test-resolution authority.
- A working mint/redeem or escrow/settlement demonstration.
- Transaction links to a Solana explorer.

Do not let an LLM independently determine payouts.

Settlement must use explicitly defined contract conditions and verified resolution inputs.

If time or environment prevents a real deployment, keep the adapter and UI honest. Clearly identify unavailable blockchain functionality.

Do not fake successful transactions.

---

# 23. DATA MODEL

Design the system around reusable structured entities.

At minimum:

## Event

- id
- title
- description
- category
- source
- externalMarketId
- eventType
- possibleOutcomes
- resolutionCriteria
- resolutionDate
- metadata

## MarketSnapshot

- eventId
- source
- timestamp
- outcome
- bid
- ask
- lastPrice, if available
- impliedProbabilityEstimate
- liquidityMetadata
- dataQuality

## Assumption

- eventId
- selectedOutcome
- addedAtVerseId
- sourceReference

## Verse

- id
- name
- parentId
- depth
- createdAt
- inheritedAssumptions
- newAssumptions
- visualMetadata

## Forecast

- id
- verseId
- targetEventId
- baselineProbability
- ensembleProbability
- modelOutputs
- disagreementSummary
- assumptions
- sources
- generatedAt
- status

## VerseRelationship

- parentVerseId
- childVerseId
- relationshipType

Design efficient selectors for computing cumulative assumptions and navigating parent-child relationships.

Validate all structured outputs.

---

# 24. APPLICATION STATE

The frontend must remain responsive during asynchronous activity.

Manage:

- Selected target.
- Current Verse.
- Basket contents.
- Selected graph nodes.
- Graph viewport.
- Hover state.
- Forecast request state.
- Animation state.
- Event discovery state.
- Model-analysis progress.
- Saved Verses.
- Comparison selections.

Avoid unnecessary global rerenders.

Do not tightly couple graph physics with API responses.

Support undoing an accidental basket change.

Handle rapid user input gracefully.

---

# 25. ANIMATION QUALITY

Motion design is a product-level requirement, not decorative polish.

Every significant interaction should be animated intentionally.

## Required micro-interactions

- Button hover and press.
- Search result hover.
- Basket expansion.
- Drag acquisition and release.
- Node selection.
- Node focus.
- Graph zoom.
- Event resolution changes.
- Forecast updates.
- Verse creation.
- Verse naming.
- Navigation between Verses.
- Model disagreement reveal.
- Comparing Verses.
- Opening and closing contextual panels.

## Animation principles

Use appropriate spring physics.

Avoid excessive overshoot.

Avoid long delays for ordinary actions.

Maintain consistent motion language.

Make transitions cancellable.

Do not animate every element continuously.

Ambient graph motion should be subtle.

The interface should remain quiet when the user is reading.

Important: interactions must feel responsive even on a laptop without a dedicated GPU.

Target smooth 60 FPS behavior where feasible.

Test performance under realistic graph sizes.

---

# 26. PREMIUM DESIGN QUALITY CONTROL

After implementing each major screen, visually inspect it.

Do not assume that valid React code produces good design.

Audit:

### Composition

Does the screen have a clear focal point?

Does the graph dominate appropriately?

Is there enough negative space?

Are controls positioned intentionally?

### Typography

Are text sizes consistent?

Are headings properly weighted?

Is secondary information sufficiently quiet?

Are long market titles handled gracefully?

### Color

Is the interface actually near-black?

Are accents restrained?

Are probability increases and decreases understandable?

Are neutral states genuinely neutral?

### Spacing

Are gaps consistent?

Are alignments precise?

Do panels feel like part of one system?

### Motion

Do animations communicate state?

Are transitions smooth?

Is any animation distracting?

### Product credibility

Does the interface look like software someone would trust?

Does any element appear to exist merely for decoration?

Are there unfinished or generic-looking components?

**If any screen looks like a generic AI-generated dashboard, redesign it before considering it complete.**

---

# 27. FULL DEMONSTRATION JOURNEY

The finished product must support a convincing end-to-end demonstration.

Use a scenario such as:

**Target: Bitcoin above $150,000 by December 2027.**

### Scene 1 — Origin

The user opens FORK.

A minimal, beautiful spatial universe is visible.

They search for a target market.

### Scene 2 — Event discovery

The user discovers several related events.

They inspect possible outcomes.

They drag selected events into their basket.

### Scene 3 — Basket construction

The user assumes:

- Fed cuts rates.
- Crypto ETF approved.
- Recession avoided.

The event basket updates smoothly.

### Scene 4 — Fork

The user presses FORK REALITY.

The graph reacts.

The camera warps.

The previous world recedes.

### Scene 5 — Arrival

A new Verse appears.

The target probability transitions from baseline to the new conditional estimate.

The models' results appear.

The user names the Verse:

**ETF Euphoria**

### Scene 6 — Model disagreement

One model disagrees significantly.

The user clicks it.

The interface reveals the assumptions behind the disagreement.

### Scene 7 — Deeper fork

The user adds an additional assumption.

The world forks again.

The result changes.

### Scene 8 — Compare

The user returns to the graph and compares both Verses.

The interface highlights which assumptions differ and how their forecasts compare.

### Scene 9 — Markets

The user switches to Markets Mode.

They inspect the actual Gemini market data associated with relevant events.

### Scene 10 — Onchain extension

If implemented, the user opens a Solana conditional position associated with a supported, precisely defined event.

All blockchain interactions must be genuine.

The complete demonstration should feel like one coherent journey.

---

# 28. DEMONSTRATION DATA AND FALLBACKS

A beautiful product cannot depend on external APIs working perfectly during a live demonstration.

Create a robust demonstration dataset.

Include a small curated selection of hypothetical events with coherent narratives.

Provide:

- Event descriptions.
- Outcomes.
- Clearly labeled illustrative baseline probabilities.
- Precomputed example forecasts.
- Sources where legitimately available.
- Verse relationships.
- Example disagreement cases.

The entire main flow should be usable without external API credentials.

However:

**Never represent fixture data as live Gemini data or a real model result.**

Use explicit mode labeling.

Separate:

- LIVE DATA
- MODEL ESTIMATE
- DEMONSTRATION

The demo should still look excellent in fallback mode.

Where AI services are available, use real generated responses.

Where they are unavailable, use reproducible demonstration scenarios.

---

# 29. RESPONSIVENESS

Desktop is the primary experience.

Optimize for modern laptop screens around 1440×900 and larger.

Also support:

- 1280×800.
- Common tablet dimensions.
- Mobile screens with a simplified graph interaction model.

Do not force the full desktop graph layout into a narrow mobile viewport.

On smaller screens, prioritize:

- Target selection.
- Current Verse.
- Basket.
- Forecast.
- Simple branch navigation.

Do not allow overlapping panels, clipped buttons, or unreadable percentages.

---

# 30. ACCESSIBILITY

Implement:

- Keyboard-accessible controls.
- Meaningful button labels.
- Visible focus states.
- Appropriate contrast.
- Reduced-motion support.
- Escape-key dismissal for overlays.
- Screen-reader descriptions of important graph actions.
- Click-based alternatives to drag-and-drop.

A visually immersive interface should still be usable without precise pointer gestures.

---

# 31. PERFORMANCE

Avoid unnecessary heavy rendering.

Use appropriate techniques:

- Memoized graph nodes.
- Selective state subscriptions.
- Request deduplication.
- Cached market data.
- Virtualization for large event lists.
- Efficient graph-layout updates.
- Hardware-accelerated transformations.
- Controlled particle counts.
- Debounced search.
- Abortable requests.

Do not continuously rerender the entire graph when a text field changes.

Profile the application if graph interaction becomes sluggish.

---

# 32. ERROR HANDLING

The UI must gracefully handle:

- Gemini API unavailable.
- No relevant markets found.
- Search returning zero results.
- Forecast API timeout.
- Partial model failure.
- Invalid model output.
- Conflicting basket assumptions.
- Unsaved Verse changes.
- Persistence failures.
- Wallet disconnected.
- Transaction rejected.
- Missing credentials.

Errors should be clearly explained and visually integrated into the design system.

Avoid raw browser alerts.

Never silently substitute invented live data.

---

# 33. TESTING

You are responsible for testing the actual application.

At minimum, verify:

1. Initial application loads correctly.
2. Target search works.
3. Event selection works.
4. Dragging events into the basket works.
5. Click-to-add works.
6. Event resolutions can be changed.
7. Basket items can be removed.
8. Fork creation works.
9. The transition completes without state corruption.
10. New Verse is saved.
11. Verse name can be edited.
12. Parent navigation works.
13. Multi-layer branching works.
14. Switching target events works.
15. Probability display updates correctly.
16. Model disagreement can be inspected.
17. Verse comparison works.
18. Reloading preserves the graph.
19. Demo fallback works without credentials.
20. Reduced-motion behavior works.
21. No serious layout overflow occurs.
22. No critical console or runtime errors remain.

Where practical, use Playwright for browser interaction testing.

Capture screenshots of major states.

Review them visually rather than relying only on automated test results.

If a visual state looks unfinished, fix it.

---

# 34. IMPLEMENTATION ORDER

Do not attempt everything at once.

Follow this sequence.

## Phase 1 — Foundation

- Inspect the repository.
- Identify existing architecture.
- Establish the technical stack.
- Configure fonts and icons.
- Build design tokens.
- Define domain models.
- Implement application state.

## Phase 2 — Core visual environment

- Build full-screen dark workspace.
- Implement custom graph visuals.
- Implement smooth pan/zoom.
- Implement elegant node interactions.
- Establish visual hierarchy.

## Phase 3 — Target and basket

- Build event search.
- Build discovery panel.
- Build draggable event interactions.
- Build basket resolution controls.
- Support event removal and conflict detection.

## Phase 4 — Forking and Verses

- Implement Verse creation.
- Implement parent-child relationships.
- Implement persistence.
- Implement graph navigation.
- Implement cinematic fork animation.
- Implement Verse naming.

## Phase 5 — Forecast UI

- Implement forecast panels.
- Implement model disagreement.
- Implement probability transitions.
- Implement Compare Verses.
- Implement suggested next forks.

## Phase 6 — Backend and data

- Integrate Gemini public event discovery.
- Create model provider adapters.
- Implement forecasting ensemble.
- Validate model output.
- Add caching and persistence.
- Implement demonstration fallback.

## Phase 7 — Solana

- Add wallet integration.
- Implement the selected narrow onchain feature if feasible.
- Verify transactions.
- Clearly label any functionality that remains simulated.

## Phase 8 — Quality and refinement

- Inspect screenshots.
- Improve typography.
- Improve spacing.
- Refine graph geometry.
- Refine animation easing.
- Fix responsiveness.
- Resolve broken interactions.
- Run tests.
- Run production build.
- Document completed features and limitations.

---

# 35. AUTONOMOUS WORK INSTRUCTIONS

You should behave as an engineer responsible for delivering a finished product.

Do not stop after writing a plan.

Do not stop after creating a basic Next.js application.

Do not stop after implementing the homepage.

Do not stop because an API credential is missing.

Do not stop because one external service fails.

When blocked, implement an adapter or fallback and continue with unaffected work.

Do not ask the user to make routine design decisions.

Choose sensible defaults.

Keep code readable and maintainable.

Avoid premature abstractions.

Do not install unnecessary dependencies.

Do not use placeholder buttons that do nothing.

Do not present unfinished views as implemented.

Do not claim deployment or integration success without verifying it.

Regularly run the application and inspect actual rendered output.

**Iterate until the interface is visually cohesive and the complete demonstration journey works.**

---

# 36. FINAL DELIVERABLES

When implementation is complete, provide:

1. The working application source code.
2. Instructions for installing and running it.
3. A list of environment variables.
4. A clear description of implemented features.
5. A clear distinction between live, simulated, and incomplete functionality.
6. A description of the architecture.
7. Test results.
8. A concise explanation of the main user journey.
9. Screenshots or browser captures of the major application states, if supported by your environment.
10. Any known limitations.

The application must run locally without requiring private API credentials, using clearly labeled demonstration mode when necessary.

If deployment is supported and authorized, provide its verified URL.

---

# 37. FINAL ACCEPTANCE STANDARD

The product is not complete simply because the code compiles.

It is complete only when the following experience works cohesively:

**A user opens a stunning dark multiverse interface, selects a target event, discovers related events, drags them into a responsive basket, chooses their assumed outcomes, triggers a cinematic Fork, enters a newly created Verse, watches the target forecast change, inspects four model perspectives, names the world, creates deeper branches, and navigates or compares multiple possible futures.**

This experience must be visually exceptional.

The graph must feel alive.

The interactions must feel deliberate.

The transitions must feel cinematic.

The application must remain understandable.

The data must be honestly labeled.

The implementation must be functional.

**The entire product should feel like a single carefully designed instrument, not a collection of generated components.**

# 38. THE ULTIMATE DESIGN PRINCIPLE

We are not building another analytics dashboard.

We are building a way to experience hypothetical futures.

A user should remember the moment they dragged several events into their basket, pressed FORK REALITY, watched the universe bend, and arrived in a completely different world with its own probabilities.

**The goal is to make conditional forecasting feel like exploring the multiverse.**

Everything you implement should reinforce that feeling.

Build it. Test it. Refine it. Finish it.

# Glance Devpost answer brief

Internal source of truth for drafting Devpost answers, the pitch, and the demo.
Use this alongside `SUBMISSION.md`, `PAYMENTS.md`, and current test results. Never
describe a planned feature as shipped; verify current behavior before making a
technical claim.

## Core story

- **Name:** Glance
- **Tagline:** Buy with your eyes.
- **One-line pitch:** Glance turns Meta Ray-Ban Display glasses into an
  AI-powered visual shopping assistant: look at something, understand it,
  compare it, and act without reaching for a phone.
- Position Glance as a capability that belongs on the glasses, rather than just
  another app. The world becomes the storefront and Glance becomes the cart.
- Theme: shopping is moving from searching and browsing toward collaborating
  with AI. Glance combines vision, personalization, generative AI, and commerce
  to make that interaction immediate and contextual.

## Product modes

- **Glimpse:** Recognizes clothing and other products seen in the world, shows
  likely matches and prices, and lets the wearer purchase an eligible item.
- **Grocery:** Tracks a physical cart, compares nearby and online prices, shows
  nutrition and dietary warnings, uses a shared shopping list, provides aisle
  guidance, and summarizes spending after checkout.
- **Gourmet:** Recognizes a prepared dish, suggests recipes, respects allergies
  and diets, and sends chosen ingredients to Grocery's shared shopping list.

The scan flow should first show candidate objects when the view is ambiguous.
If the wearer is clearly holding one item, Glance can skip candidate selection.

## Value and differentiation

- Identifies a product's brand, variant, price, nutrition, and relevant offers
  from the wearer's point of view.
- Shortens the path from discovery to purchase by putting comparison and
  checkout in the same visual interaction.
- Carries context between discovery, meal planning, shopping lists, in-store
  guidance, checkout, and budgeting.
- Uses preferences such as allergies, diets, purchase history, and style only
  when the user opts into personalization.
- Product promise: Glance does not sell personal data or use it to train AI.
  Confirm the published privacy policy and implementation before making this an
  unconditional legal claim.

## Business model

- Free for consumers.
- Marketplace commission/service fee on purchases completed through Glance.
- Clearly disclosed sponsored listings, similar to search advertising, billed
  for qualified clicks or verified conversions.
- Keep the payment description precise: Visa card payments are processed by
  Stripe; commissions and merchant transfers use Stripe Connect when the
  connected-account setup is enabled.

## Tracks and judging priorities

Tailor the demo and answers to the **Visa** and **SideShift** tracks. Also be
ready to tailor examples for **Perceptron** if relevant to a submitted track or
sponsor prompt.

- **Innovation — 25%:** A visual shopping journey that connects product
  discovery, comparison, personalization, purchase, grocery assistance, and
  recipes.
- **User Experience — 25%:** Clear state, automatic scanning where appropriate,
  predictable controls, readable focus, quick recovery, and a polished demo.
- **Technical Execution — 20%:** Meta DAT hardware integration, shared lens
  runtime, camera input, AI recognition, commerce services, and performance.
- **Commerce Impact — 15%:** Less friction, faster conversion, useful
  comparisons, merchant revenue, engagement, and loyalty.
- **Trust & Responsibility — 15%:** Explicit scans and purchase intent,
  transparent sponsorship, privacy controls, secure payment handling, and
  honest labeling of sample or simulated behavior.

## Three-minute presentation

Keep the presentation under three minutes so judges have time for questions.
Record and submit the presentation video to Devpost; teams without a submitted
video are not eligible to judge.

Suggested sequence:

1. **Hook:** “Glance: buy with your eyes. The world is your store, and Glance
   is your shopping cart.”
2. **Problem:** Product discovery breaks when someone cannot identify an item,
   a listing is hard to find, or taking out a phone interrupts the moment.
3. **Glimpse:** Look at a jacket, identify it, compare an offer, and purchase.
4. **Gourmet:** Look at a meal, find a suitable recipe, and add its ingredients
   to the shopping list.
5. **Grocery:** Open that shared list, track the cart total, compare an item's
   price and nutrition, receive a dietary warning, and follow aisle directions.
6. **How it works:** Camera + Meta DAT + the Glance lens runtime + AI services +
   Stripe/Supabase.
7. **Business:** Free for consumers; commission and disclosed sponsored
   listings create merchant and platform value.
8. **Close:** “If you can see it, you can buy it.”

The recorded story can use a person spotting a jacket before its wearer leaves,
buying it through Glimpse, recognizing food at a party through Gourmet, and then
shopping for the ingredients through Grocery. Keep the language judge-friendly
and avoid jokes that distract from the product or trust story.

## Demo behavior to show

- A short launch moment: “Welcome to Glance — Buy with your eyes.”
- Glimpse identifies clothing, shows offers, and completes checkout in the lens.
- Successful purchase state uses a green check and **Done!**, with a secondary
  “Details on your phone” action.
- Grocery shows the shared list, live cart total, price comparison, nutrition,
  dietary guidance, directions, and an **All checked out** action.
- Gourmet turns a recognized meal into recipes and a Grocery shopping list.
- Directions confirm: “Notification sent to your phone,” then offer navigation
  through Meta Maps or the phone.
- The UI clearly distinguishes scanning, identifying, comparing, navigating,
  paying, and completion states.

## Current product backlog from testing

Treat every item below as unresolved until it is retested on the phone and Meta
Ray-Ban Display:

- Arrowhead bottled water does not add its price to the Grocery cart total.
- The scanning/loading indicator can remain stuck in all three modes.
- Frame rate has been too low on the glasses.
- Glimpse left/right selection can move focus instead of activating the intended
  button; other buttons may exhibit the same behavior.
- Focus needs an unmistakable outline so the wearer knows which action is active.
- Purchase completion should show a green check and **Done!**, followed by
  “Finish on your phone” or “Details on your phone” as a secondary action.
- Product detail screens, Grocery, and Directions need reliable back actions.
- Greek vanilla yogurt can be added twice on its first interaction.
- Grocery needs an **All checked out** action.
- Grocery needs the shared Gourmet shopping list.
- Directions need a completion/notification message and a way to return without
  refreshing the app.
- Scanning should start automatically in the intended demo flow.
- The logo must not act as an accidental navigation link in the lens.
- App icon and launch/loading experience need a final polish pass.

## Accuracy guardrails for answers

- Distinguish deterministic demo fixtures from live AI recognition.
- Distinguish Stripe sandbox payments from live money movement.
- Distinguish simulated fulfillment and sample pricing from merchant inventory.
- State physical-device results only from the latest verified build and logs.
- Do not present face recognition as part of the submission. It is outside the
  current shopping story and creates avoidable privacy and trust concerns.
- Do not claim a direct Visa API integration unless one is actually added.
- Do not claim Meta Maps integration unless the navigation handoff is verified.

## Short answer bank

**What did you build?**  
Glance is an AI shopping assistant for Meta Ray-Ban Display glasses. It lets a
wearer identify products and meals, compare useful information, manage an
in-store trip, and purchase eligible products from the same visual interface.

**What problem does it solve?**  
Shopping context is fragmented across what people see, browser searches, notes,
store aisles, nutrition labels, and checkout. Glance connects those moments at
the point of sight, reducing the time and attention required to act.

**How does it make money?**  
Glance is free for consumers. It earns a commission on completed marketplace
purchases and can offer clearly labeled sponsored placements charged on
qualified engagement or verified conversion.

**Why glasses?**  
Product discovery starts with sight. Display glasses can keep the interaction in
context: the wearer sees an item, receives a small amount of relevant
information, and decides what to do without breaking the moment to search on a
phone.

**How do you handle trust?**  
Glance makes sponsored results visible, requires deliberate purchase actions,
keeps payment credentials with the payment provider, supports opt-in
personalization, and distinguishes live services from sample demo data.

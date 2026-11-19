# Oracle fixtures

A.json and B.json are deliberately synthetic contract responses using documented
Gemini fields. Their rules text is local demo evidence, not a Gemini contract.
registrations.json commits the exact ticker/instrument, canonical terms hash,
explicit close, and separate observation timestamp. Tests need no network.

Implementation checked the official public specification:
https://developer.gemini.com/prediction-markets-spec/markets
https://developer.gemini.com/prediction-markets-spec/~schemas

A live list and detail response were also inspected on 2026-11-18 (client date).
The detail request used ticker BTC2611182300; one selected contract was
GEMI-BTC2611182300-HI62100. Observed contract status was settled,
resolutionSide=yes, expiryDate=2026-11-18T23:00:00.000Z,
resolvedAt=2026-11-18T23:00:06.504Z. The enclosing event's resolvedAt differed
(23:00:07.889Z), and the event type was categorical although the selected
contract had a binary YES/NO result. Settled contract prices contained empty
buy/sell objects. Description was a rich-text object, not necessarily a string.
No undocumented field is used by the adapter. These observations motivated the
exact-contract selection and optional-price handling; live snapshots are not
required for reproducible tests.

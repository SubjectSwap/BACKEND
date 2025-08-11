# SubjectSwap — BACKEND

> This README documents the Express backend for **SubjectSwap** (currently deployed on: <a href="https://subjectswap-backend.onrender.com">`https://subjectswap-frontend.onrender.com`</a>).
> It explains API endpoints grouped by category, data models, socket/live-chat design (including encrypted tunneling), folder structure, and notable design decisions.  
> For general evaluation repository
<a href="https://github.com/SubjectSwap/SubjectSwap/">`https://github.com/SubjectSwap/SubjectSwap/`</a>  
> For frontend repository
<a href="https://github.com/SubjectSwap/FRONTEND/">`https://github.com/SubjectSwap/FRONTEND/`</a>
---

## Table of contents

1. [Quick overview](#quick-overview)
2. [API endpoints (by category)](#api-endpoints-by-category)
3. [Socket / Live chat (encrypted tunneling)](#socket--live-chat-encrypted-tunneling)
4. [Data models & storage patterns](#data-models--storage-patterns)
5. [Matchmaking algorithm (how matches are made)](#matchmaking-algorithm-detailed)
6. [Account creation, login, and caches](#account-creation-login-and-caches)
7. [Denormalization & soft-delete patterns](#denormalization--soft-delete-patterns)
8. [Folder structure & key files (roles)](#folder-structure--key-files-what-each-does)
9. [Design decisions (summary)](#design-decisions-summary--rationale)
10. [How to run?](#how-to-run-quick)
11. [References in Repo](#where-in-the-code-to-look-for-the-implementation-details-referenced-here)

---

## Quick overview

SubjectSwap backend:

* NodeJS + Express + MongoDB.
* Uses JWT for auth and for protected routes (cookie + token-in-body patterns across endpoints).
* Stores chat conversations as *documents that each hold up to 1000 messages* (so a logical conversation is represented by a chain of `Conversation` documents — new doc after every 1000 messages). This reduces write amplification and makes conversation objects indexable/fast to read.

---

## API endpoints (by category)

### Auth & account management

* **POST** `/create-account`
  Request body: `{ username, email, password }`
  Creates a temporary registration entry and sends a frontend powered verification link to the email (the link contains a UUID).

* **POST** `/verify-account/:uuid`
  Sent by the frontend page when accessed. Can work exactly once. Accepts the UUID from the email link; if found in `tempUsers`, creates a persistent `User` in MongoDB and deletes the temp entry.

* **POST** `/login`
  Body: `{ email, password }`
  Verifies password (bcrypt), returns user object (with sensitive properties removed) and a JWT token; sets cookie `SubjectSwapLoginJWT` with `httpOnly` and `SameSite=None` (intended for cross-site flows).

* **POST** `/verify-user`
  Body: `{ token }` — verifies a JWT and returns the user info.

* **PUT** `/edit-profile`
  A protected route. Body must include a valid token (token is decoded to obtain user id). Supports updating username, languages, learningSubjects, and teachingSubjects, profile-pic update.

---

### Matchmaking

* **POST** `/matchmaking/match`
  Body: `{ token, wantSubject, mySubjects }`
  Runs an pipeline over users to compute a customized list of candidates and returns sorted matches. The algorithm is discussed later.

---

### Search

* **POST** `/search/person`
  Body: `{ query }`
  Uses MongoDB Atlas Search (`$search` with an autocomplete index) to return matching users (username autocomplete + score ordering).

* **POST** `/search/user/:uuid`
  Fetch detailed public profile for a user by id (only for active users).

---

### Chat / Conversations (REST)

* **POST** `/chat/previous_chats`
  Body: `{ token, to? }` (token must be valid) — returns the conversation partner list (basic info) or conversation metadata for a chat pair.

* **POST** `/chat/get_user_info`
  Body: `{ token, uuid }` — fetches a user's public info for chat preview (id, username, profilePic).

---

### Ratings

* **POST** `/rating_routes/personality`
  Body: `{ token, to, rating }` — rate a user's personality.tracks previous ratings by the rater and updates the target's aggregated personality rating accordingly.

* **POST** `/rating_routes/subject`
  Body: `{ token, to, subjectName, rating }` — rate another user's subject teaching ability. The endpoint checks whether the rater had already rated that `(to, subjectName)` pair (and updates totals accordingly);

---

## Socket / Live Chat (encrypted tunneling)

**Namespace**: `/private_chat` (Socket.IO)

**Authentication**:

* Socket handshake requires `auth.token` (the JWT). The server verifies the JWT and sets `socket.user`.

**Main flow & events** (high-level):

1. **`join_conversation`** `{ to, publicKey }`

   * The client asks to open/join a peer conversation. The server checks the `to` user id validity, computes a deterministic room id `usersString` (sorted pair: `smallerId_biggerId`), calls `socket.join(usersString)`.
   * If client sent a `publicKey`, server stores it in an in-memory `userPublicKeys` map for that session (so the server knows how to encrypt messages for that client).

2. **`previous_chats`** `{ to }`

   * The server fetches `Conversation` documents for `participantId = usersString`. Because conversations are stored in chunks (max \~1000 messages per Conversation document), the server chooses the most recent one or merges the two most recent when needed and returns messages.
   * The server returns `server_public_key` (RSA public key generated server-side), the `archived` flag, and the `chats` (messages). Messages are encrypted with the client's public key before sending.

3. **`message_sent`** `{ to, content, type, filedata? }`

   * **Decryption on server**: The server first attempts to `privateDecrypt` the incoming `content` using the server private key (the client send text message encrypted using the server public key). If not encrypted, it will just take content as-is.
   * **Files**: if `type === 'file'` and `filedata` present, the file buffer is uploaded to Cloudinary and the stored URL becomes `message.content`.
   * **Persistence**: the server saves the message **plain-text** into the DB inside the appropriate `Conversation` document. If the latest `Conversation` doc already has `>= 1000` messages (the chunk threshold), the server creates a new `Conversation` doc and starts an appended chunk. This is how chunking/archiving is implemented.
   * **Outgoing encryption**: Before emitting the message to the sender and receiver sockets, the server encrypts the message content with each recipient's public key (if available) using RSA OAEP and sends base64-encoded ciphertext. The server emits `message_received` to the sender (with `byMe: true`) and to the receiver(s) in the room (with `byMe: false`).

4. **Other events**:

   * `offline` — leaves the room (keeps key until disconnect).
   * `disconnect` — server removes the user's public key from the in-memory map.

**Crypto & key handling details**:

* The server generates a server RSA key-pair at process start (`2048` bits).
* Clients are expected to send their public RSA key to the server when joining a conversation.
* For message sending:

  * Client may encrypt with server public key → server decrypts to get plaintext to persist.
  * Server re-encrypts message plaintext for each recipient with their public key and emits.
* All ciphertexts are base64 encoded across the wire.
* The server stores only plaintext in the DB (so stored chat content is in plain text in the DB—encryption is used for transport between server and client). The advantage is that persisted data is optimized for indexing and fast reads while the tunnel ensures the network transport between server and client is not cleartext for the active socket connections.

---

## Data models & storage patterns

### `Conversation` (models/Conversation.js)

* Schema highlights:

  * `participantId: String` — canonical pair id string like `smallerId_biggerId`.
  * `messages: [{ type, timestamp, content, from, id }]` — messages array (mixed types: `'text' | 'file' | 'deleted'`).
  * `noOfMessages: Number` — a useful counter.
* **Chunking**: At runtime the server keeps messages in arrays; once a conversation record reaches \~**1000 messages** the writing code starts a new `Conversation` document for the same `participantId`. This reduces the number of writes per document and enables indexing/fast reads of the most recent chunk(s).

### `User` (models/User.js)

* Important fields:

  * `username`, `email`, `passwordHash`, `profilePicUrl`, `description`, `languages` (array).
  * `teachingSubjects: [{ subjectVector, subjectName, selfRating, noOfRatings, totalReceivedRatings, active }]`

    * `subjectVector` — precomputed unit vector for the subject (from `constants/vectorEmbeddings.js`).
    * `active` — boolean to indicate if the subject is currently enabled (ratings are retained even when `active` is false).
  * `learningSubjects: [String]`
  * `personalityRating: { average, totalRatings }` — aggregated personality rating values. Describes how fellow users rateda user's attitude.
  * `active: { type:Boolean, default:true }` — user soft-delete / disable flag such that they can no longer be operated on all the while maintaining their legacy data.
  * `peopleIRated: [{ type: 'personality'|'subject', rating, to, subjectName? }]` — denormalized local history of which users (and which subject of theirs) this user has rated. This array is used to implement idempotent rating updates and to rollback/take-back rating operations.

---

## Matchmaking algorithm (detailed)

**High-level idea**: compute a `totalScore` per candidate user that combines:

* similarity between the requested subject vector and *candidate teaching subject vectors* (dot product with precomputed unit vectors),
* candidate’s self-rating and the community's ratings for that subject,
* penalties/rewards based on rating distribution,
* small multiplicative reward if the candidate learns subjects that intersect with `mySubjects`.

**Concrete steps (as implemented)**:

1. Input:

   * `wantSubject` — the subject the searching user wants (mapped to a unit vector).
   * `mySubjects` — an array of user’s own subjects used for learning-subject overlap bonus.

2. Per candidate `teachingSubject` (only `active` ones with a valid `subjectVector` of the same length):

   * Compute dot product `dotScore = dot(subjectVector, wantVector)` (this is done inside MongoDB aggregation using `$reduce` over the dimension).
   * Compute `avg_rating` for that teaching subject: `avg_rating = totalReceivedRatings / noOfRatings` (or `0` if `noOfRatings === 0`).
   * Compute `baseScore = dotScore * ( selfRating/2 + avg_rating_if_exists )`.
   * Apply **penalties/rewards**:

     * If `noOfRatings > 100` and `totalReceivedRatings < 4` → **penalty -4** (flags a poorly rated subject despite many ratings).
     * Else if `noOfRatings > 100` and `totalReceivedRatings > 7` → **reward +3** (trusted/consistently rated teachers).
     * If `noOfRatings > 0` and `|selfRating - avg_rating| > 5` → **penalty -4** (selfRating wildly different from community rating).
   * Sum per-subject contributions for a user to produce a partial score.

3. Add cross-subject bonus:

   * `size(setIntersection(user.learningSubjects, mySubjects)) * 3` — users who want to learn what you teach (mutual benefit) get a massive multiplication bonus.

4. Keep only users with `totalScore > 0`, sort by `totalScore` descending, and return selected fields.

**Implementation detail**:

* All of the above is implemented inside a MongoDB aggregation pipeline (using `$match`, `$addFields`, `$map`, `$reduce`, `$let`, `$cond`, etc.). Doing the math inside the DB reduces data transfer and leverages Atlas' aggregation optimization. Vector constants are stored in `constants/vectorEmbeddings.js` (unit-normalized vectors).

---

## Account creation, login, and caches

### Temporary account flow

* When a user POSTs to `/create-account`:

  * The server validates inputs and checks `tempUsers.checkMail(email)` to ensure the same email isn't in an active temp session.
  * If OK, it hashes the password (bcrypt), generates a `uuid`, stores `{ username, email, passwordHash }` in the **in-memory cache** `tempUsers` keyed by the uuid, and sends a verification email with link containing the uuid. After verification the `/verify-account/:uuid` endpoint moves the temp entry into the persistent `User` collection and deletes the temp cache entry.

### Cache implementation

* `cache/tempUsers.js` defines a small `Cache` class that wraps a `Map` plus TTL semantics:

  * Methods: `set`, `get`, `has`, `delete`, `clearTimeout`, `checkMail`.
  * Two instances exported: `tempUsers` and `permanentUsers` with different timeouts (configured in `constants/cronJobTimers.js`). The `clearTimeout()` method will iterate and remove expired entries — this is invoked regularly by a cron job. This wrapper makes it straightforward to later replace the backing `Map` with Redis or another store with minimal changes.

### Cron job

* Index (`index.js`) registers a cron schedule that calls `clearUserCache()` at a period derived from `constants/cronJobTimers` (the smallest configured interval). `clearUserCache()` simply calls `tempUsers.clearTimeout()` so stale temp registrations get removed automatically.

---

## Denormalization & soft-delete patterns

### `peopleIRated` denormalization

* Each `User` document contains `peopleIRated` records: when a user rates another (personality or subject), an entry is appended (or updated) in `peopleIRated`. This enables:

  * Efficient updates (to detect if a rater is changing a previous rating).
  * Ability to traverse a user's outward rating activity if needed during deletion/cleanup or audits.
* Rating update endpoints use `peopleIRated` to determine whether to increment aggregate counters or replace old ratings (adjusting sum totals accordingly).

### Soft-delete & active flags

* Users and teaching subjects have `active` booleans:

  * `User.active` (default `true`) indicates whether the user is "active". In many queries the code filters by `{ active: true }` so deactivated users stop showing up but historical records and references remain in place.
  * `teachingSubjects[].active` allows disabling a subject without removing its rating totals (so past ratings persist).
* This design avoids deleting documents outright because users/comments/chats/ratings may refer to historical data and removing DB documents would complicate referential integrity. Instead, the system prefers traversing denormalized lists (e.g., `peopleIRated`) to update related aggregates and then set `active: false` to remove the entity from active lists while preserving the historical footprint.

---

## Folder structure & key files (what each does)

(only top-level folders and files present in the repository)

```
/cache
  tempUsers.js            # in-memory Cache class (tempUsers, permanentUsers)

 /constants
  vectorEmbeddings.js     # subject vector embeddings (normalized unit vectors)
  cronJobTimers.js        # configured timeouts (unregistered/registered users, minTime)

 /errors
  chat_related_errors.js  # custom errors (e.g., ConversationUsersOverloaded)
  incorrect_profilepic_file_type_error.js

 /models
  User.js                 # Mongoose User schema (teachingSubjects, peopleIRated, active flags)
  Conversation.js         # Mongoose Conversation schema (participantId, messages, noOfMessages)

 /routes
  auth.js                 # create-account, verify-account, login, verify-user, edit-profile
  chat_routes.js          # /previous_chats, /get_user_info
  matchmaking.js          # /match -> aggregation + ranking
  search.js               # /person (username search), /user/:uuid
  rating_routes.js        # rating endpoints (personality, subject, take-back)

 /sockets
  chats.js                # Socket.IO namespace /private_chat, RSA key flow, message handling

 /utils
  conversationHelpers.js  # helpers (getUserOrder, getFromBoolean, getActualSender)
  encryptionHelpers.js    # (deprecated xor helper)
  sendEmail.js            # nodemailer wrapper
  clearCache.js           # wrapper to clear caches used by cron

 index.js                  # app bootstrap: express, cors, mongoose connect, start server, attach sockets, start cron
 package.json
 .env example
 vercel.json
```

> Most files referenced above appear in the repo and are the primary places to look for implementation details (models, routes, sockets, caches and constants). The code organizes heavy computation inside MongoDB aggregation pipelines and uses utilities for deterministic conversation ordering and crypto helpers.

---

## Design decisions (summary & rationale)

* **Conversation chunking (1,000 message chunks)**
  Each `Conversation` document stores up to \~1000 messages before a new document is created. This reduces per-document write pressure and enables indexing/searching of the most recent chunk(s) while keeping archival chunks intact. Indexing the `participantId` and returning / merging only the latest chunk(s) yields fast reads for active conversations.

* **Transport encryption (end-to-end-ish) + server-side storage**
  Messages are protected during transport by RSA-based encryption between clients and server: clients share public keys with server; the server provides its public key for client -> server encryption; server decrypts, persists plaintext, then encrypts for each recipient with their public key. This ensures on-the-wire confidentiality while enabling server-side features (indexing, search).

* **Denormalization for ratings**
  Ratings are tracked both inside the `teachingSubjects` aggregated counters and inside `peopleIRated` entries on the rater document. This enables idempotent updates (change/undo ratings) and allows the system to traverse outward rating relationships when doing deletions or data cleanup. It favors read performance for ranking and search.

* **Soft-delete (`active: false`)**
  Users and subject entries can be marked inactive to preserve historical references (messages, comments, ratings) while removing them from active matching/search results.

* **Aggregation-based matchmaking**
  Match scoring runs inside MongoDB aggregation to leverage the DB cluster’s compute and indexing (vector dot-product style calculation + rating heuristics), reducing data movement and making ranking scale better.

* **Cache abstraction**
  `cache/tempUsers.js` wraps a `Map` with TTL semantics. Because it's a simple class wrapper, migrating the same small API to Redis later is straightforward — the rest of the code depends on the wrapper methods, not the underlying implementation.

* **Minimal persistent writes for chat**
  By grouping messages into chunks, writes happen fewer times per conversation lifecycle, improving DB write amplification and allowing efficient chunk-level archival or TTL strategies later.

---

## How to run (quick)

1. Clone repo and install dependencies:

   ```
   npm install
   ```
2. Provide environment variables (see `.env.example`). You would have to request us for actual keys.  
3. Start:

   ```
   npm run dev    # uses nodemon in development
   npm start      # production
   ```

---

## Where in the code to look for the implementation details referenced here

* Socket + encryption: `sockets/chats.js`.
* Conversation chunking & schema: `models/Conversation.js`.
* Matchmaking aggregation + scoring: `routes/matchmaking.js`.
* Vector definitions: `constants/vectorEmbeddings.js`)
* Auth + create-account + verify flow: `routes/auth.js`.
* Temp cache & TTL: `cache/tempUsers.js` and cron scheduling in `index.js`.
* User model & denormalization: `models/User.js` and rating updates in `routes/rating_routes.js`.
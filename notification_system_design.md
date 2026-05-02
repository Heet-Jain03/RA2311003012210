# Notification System Design

---

## Stage 1

### Core Actions the Platform Must Support

The campus notification platform enables students to receive real-time updates for Placements, Events, and Results. The core actions are:

1. Fetch all notifications for a student
2. Fetch unread notifications for a student
3. Mark a notification (or all) as read
4. Receive real-time notifications (push)
5. Fetch notifications filtered by type

---

### REST API Endpoints

#### 1. Get All Notifications for a Student

```
GET /api/notifications
```

**Headers:**
```json
{
  "Authorization": "Bearer <token>"
}
```

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "TCS is hiring",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:30Z"
    }
  ]
}
```

---

#### 2. Get Unread Notifications

```
GET /api/notifications?isRead=false
```

**Headers:**
```json
{
  "Authorization": "Bearer <token>"
}
```

**Response (200):**
```json
{
  "notifications": [ ... ],
  "count": 12
}
```

---

#### 3. Mark a Notification as Read

```
PATCH /api/notifications/:id/read
```

**Headers:**
```json
{
  "Authorization": "Bearer <token>"
}
```

**Response (200):**
```json
{
  "message": "Notification marked as read",
  "id": "uuid"
}
```

---

#### 4. Mark All Notifications as Read

```
PATCH /api/notifications/read-all
```

**Headers:**
```json
{
  "Authorization": "Bearer <token>"
}
```

**Response (200):**
```json
{
  "message": "All notifications marked as read",
  "updatedCount": 15
}
```

---

#### 5. Get Notifications by Type

```
GET /api/notifications?type=Placement
```

**Query Params:** `type` = `Placement` | `Result` | `Event`

**Response (200):**
```json
{
  "notifications": [ ... ]
}
```

---

### Real-Time Notification Mechanism

**Approach: WebSockets (Socket.IO)**

- On login, the frontend opens a persistent WebSocket connection to the server.
- The server maintains a map of `studentID → socketID`.
- When a new notification is created (e.g., HR triggers "Notify All"), the server emits a `new_notification` event to the relevant socket(s).
- The client listens and updates its UI instantly without polling.

**Why WebSockets over polling?**
- Polling sends repeated HTTP requests every N seconds — wasteful and slow.
- WebSockets maintain a persistent, low-latency bidirectional channel.
- For a campus platform with 50,000 students, WebSockets with rooms/namespaces scale better.

**Socket Events:**
```
Server → Client:  "new_notification"  payload: { id, type, message, createdAt }
Client → Server:  "mark_read"         payload: { notificationId }
```

---

## Stage 2

### Recommended Database: PostgreSQL (Relational)

**Reason:** Notifications have a clear relational structure: each notification belongs to a student, has a type (enum), and a timestamp. PostgreSQL supports:
- ENUM types natively
- Efficient indexed queries on `studentID`, `isRead`, `createdAt`
- ACID compliance for reliable writes (critical so no notification is lost)
- Easy schema evolution with migrations

---

### DB Schema

```sql
CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE students (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  message           TEXT NOT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

### Problems as Data Volume Increases

1. **Full table scans** — queries without indexes will scan all 5M rows.
2. **Index bloat** — too many indexes slow down INSERT operations.
3. **Connection pool exhaustion** — 50,000 students hitting the DB concurrently.
4. **Storage growth** — notifications accumulate indefinitely.

**Solutions:**
- Add selective indexes (see below).
- Use connection pooling (PgBouncer).
- Archive old notifications (partitioning by `created_at`).
- Cache frequent reads (Redis).

---

### SQL Queries Based on Stage 1 APIs

**Fetch all notifications for a student:**
```sql
SELECT id, notification_type, message, is_read, created_at
FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC;
```

**Fetch unread notifications:**
```sql
SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = $1 AND is_read = false
ORDER BY created_at DESC;
```

**Mark one as read:**
```sql
UPDATE notifications
SET is_read = true
WHERE id = $1 AND student_id = $2;
```

**Mark all as read:**
```sql
UPDATE notifications
SET is_read = true
WHERE student_id = $1 AND is_read = false;
```

**Filter by type:**
```sql
SELECT id, message, created_at
FROM notifications
WHERE student_id = $1 AND notification_type = $2
ORDER BY created_at DESC;
```

---

## Stage 3

### Is the Query Accurate?

```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

The query is **logically correct** — it retrieves unread notifications for a student ordered by recency. However, it has several problems:

**Why is it slow?**

1. **No index on `(studentID, isRead)`** — PostgreSQL performs a full sequential scan over all 5,000,000 rows.
2. **`SELECT *`** — fetches all columns including large TEXT fields, increasing I/O even when only a few fields are needed.
3. **No LIMIT** — returns all unread rows. A student with 10,000 unread notifications sends all of them over the wire.

**What to change:**

```sql
-- Create a composite index
CREATE INDEX idx_notifications_student_unread
ON notifications (student_id, is_read, created_at DESC)
WHERE is_read = false;

-- Optimised query
SELECT id, notification_type, message, created_at
FROM notifications
WHERE student_id = 1042 AND is_read = false
ORDER BY created_at DESC
LIMIT 50;
```

This uses a **partial index** (only indexes unread rows), dramatically reducing index size.

**Likely computation cost of the fix:**
- Without index: O(N) sequential scan — ~5M row scan.
- With partial index: O(log N + K) where K = matching unread rows for that student.

---

### Is adding indexes on every column a good idea?

**No.** This advice is harmful.

- Every index adds overhead to INSERT, UPDATE, and DELETE operations (the index must be updated on every write).
- With 50,000 students receiving bulk notifications (Stage 5), write-heavy workloads will slow dramatically.
- Index storage itself consumes significant disk space.
- The query planner may choose a suboptimal index if too many exist.

**Good practice:** Index only columns used in WHERE, JOIN, and ORDER BY clauses that are queried frequently.

---

### Query to Find Students with Placement Notification in Last 7 Days

```sql
SELECT DISTINCT student_id
FROM notifications
WHERE notification_type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days';
```

With an index:
```sql
CREATE INDEX idx_notifications_type_created
ON notifications (notification_type, created_at DESC);
```

---

## Stage 4

### Problem: DB Overwhelmed on Every Page Load

Every page load hitting the database directly for all notifications is the core issue. At 50,000 students simultaneously loading their notification pages, this creates:
- Thousands of concurrent DB connections
- Repeated identical queries for the same data
- Slow response times → bad user experience

---

### Solutions and Tradeoffs

#### Solution 1: Server-Side Caching (Redis)

Cache notification lists per student with a TTL (e.g., 60 seconds).

```
GET /api/notifications
  → Check Redis cache for key "notifications:studentID"
  → If hit: return cached data (< 1ms)
  → If miss: query DB, store in Redis, return
```

**Tradeoffs:**
- ✅ Drastically reduces DB load; near-instant reads.
- ✅ Easy to implement.
- ❌ Stale data — student may not see new notifications for up to TTL seconds.
- ❌ Cache invalidation complexity: must bust cache when a new notification arrives or is read.

---

#### Solution 2: Pagination

Instead of fetching all notifications, fetch only the latest N (e.g., 20) per page.

```sql
SELECT ... FROM notifications
WHERE student_id = $1
ORDER BY created_at DESC
LIMIT 20 OFFSET $2;
```

**Tradeoffs:**
- ✅ Reduces data transferred per request.
- ✅ Simple to implement.
- ❌ Deep pagination (`OFFSET 10000`) is still slow; use cursor-based pagination instead.

---

#### Solution 3: Read Replicas

Route all `SELECT` queries to a read replica of the primary PostgreSQL instance.

**Tradeoffs:**
- ✅ Horizontally scales read capacity.
- ❌ Replication lag means replicas may be slightly behind.
- ❌ Higher infrastructure cost.

---

#### Recommended Combined Strategy:
1. Redis cache with 30–60 second TTL per student.
2. Cursor-based pagination (20 items/page).
3. Cache invalidation on new notification delivery via WebSocket event.

---

## Stage 5

### Shortcomings of the Proposed Implementation

```python
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # real-time push
```

**Problems:**

1. **Synchronous loop over 50,000 students** — this runs sequentially. If each iteration takes 100ms, total time = 50,000 × 0.1s = **5,000 seconds (~83 minutes)**. The HR user's request will time out.

2. **No error handling or retry** — if `send_email` fails for student 200, the loop stops (or skips silently). 49,800 students never get notified.

3. **Tight coupling of email + DB + push** — if the email API is down, DB inserts also don't happen. These are independent concerns and should not block each other.

4. **No atomicity** — a student might get an email but no DB record, or a DB record but no push notification.

5. **Email API failure at student 200** — the remaining 49,800 students are stranded with no recovery mechanism.

---

### Should saving to DB and sending email happen together?

**No.** They have different reliability profiles:

- DB inserts are fast and local — high reliability.
- Email API is a third-party service — subject to rate limits, downtime, timeouts.

Coupling them means an email failure prevents a DB record from being created, which means you lose the notification entirely with no audit trail.

**The DB insert should always happen first**, independently of email delivery. The email is a delivery mechanism; the notification's existence is the source of truth.

---

### Revised Design: Async Queue with Retry

```
HR clicks "Notify All"
        │
        ▼
POST /api/notify-all
  → Validate request
  → For each student_id: publish job to Message Queue (e.g., Redis Queue / RabbitMQ / BullMQ)
  → Respond immediately: { "message": "Notification queued for 50,000 students" }
        │
        ▼
Workers (N parallel workers, e.g., 10–20):
  Each worker picks a job from the queue:
    1. save_to_db(student_id, message)    ← always first
    2. push_to_app(student_id, message)   ← WebSocket emit
    3. send_email(student_id, message)    ← with retry (max 3 attempts, exponential backoff)

  If send_email fails after 3 retries:
    → Mark as "email_failed" in DB
    → Log the failure
    → Move to dead-letter queue for manual review
```

**Revised Pseudocode:**

```python
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        queue.publish("notification_job", {
            student_id: student_id,
            message: message,
            created_at: now()
        })
    return { "queued": len(student_ids) }

# Worker process (runs in parallel)
function process_notification_job(job):
    { student_id, message } = job

    # Step 1: Persist first (never fails silently)
    db_result = save_to_db(student_id, message)
    if not db_result.success:
        log_fatal("DB insert failed for student", student_id)
        return retry(job)

    # Step 2: Real-time push (best-effort, student may be offline)
    try:
        push_to_app(student_id, message)
    except:
        log_warn("Push failed for student", student_id)  # non-fatal

    # Step 3: Email with retry
    for attempt in range(1, 4):
        try:
            send_email(student_id, message)
            break
        except EmailAPIError as e:
            log_warn("Email attempt", attempt, "failed for", student_id, e)
            if attempt == 3:
                mark_email_failed(student_id, message)
                dead_letter_queue.publish(job)
            else:
                sleep(exponential_backoff(attempt))
```

**Key improvements:**
- HR gets an instant response; processing is async.
- DB insert always happens first → audit trail guaranteed.
- Email failures don't block other students.
- Failed emails are retried and tracked in a dead-letter queue.
- Workers run in parallel → 50,000 emails processed in minutes, not hours.

---

## Stage 6

### Priority Inbox: Top N Notifications

**Approach:** Score each notification by a combination of type weight and recency, then return the top N.

**Scoring Formula:**
```
score = TYPE_WEIGHT[type] × 1,000,000,000 + unix_timestamp_ms
```

| Type      | Weight |
|-----------|--------|
| Placement | 3      |
| Result    | 2      |
| Event     | 1      |

The large multiplier ensures type weight always dominates recency — a Placement notification from yesterday outranks an Event from one minute ago. Within the same type, more recent notifications rank higher.

---

**For top 10 (static fetch):**

1. Fetch all notifications from API.
2. Score each one using the formula.
3. Sort descending.
4. Return first 10.

Time complexity: O(N log N) where N = total notifications.

---

**Maintaining Top N Efficiently as New Notifications Arrive:**

Use a **min-heap of size N**.

- The heap always holds the current top N notifications.
- The root of the min-heap is the lowest-scored item among the top N.
- When a new notification arrives:
  - Compute its score.
  - If `score > heap.root.score`: pop the root, push the new notification.
  - Otherwise: discard.

This runs in **O(log N) per incoming notification** — regardless of how large the total stream grows. The heap size stays fixed at N.

**API:**

```
GET /api/notifications/priority?top=10
```

**Response:**
```json
{
  "count": 10,
  "notifications": [
    { "ID": "...", "Type": "Placement", "Message": "TCS hiring", "Timestamp": "..." },
    ...
  ]
}
```

The implementation is in `src/services/priorityInbox.ts`. The scoring, sorting, and heap-based approach are all implemented there with full logging integration via the logging middleware.

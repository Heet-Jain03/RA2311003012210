# logging_middleware

A reusable logging package for the Affordmed Campus Hiring Evaluation.

## Setup

```bash
npm install
npm run build
```

## Usage in other packages (local link)

In your backend or frontend project:

```bash
npm install ../logging_middleware
```

Then in your code:

```typescript
import { initLogger, Log, Logger } from "logging_middleware";

// Call once at app startup with your Bearer token
initLogger({ authToken: "YOUR_BEARER_TOKEN_HERE" });

// Use Log() directly
await Log("backend", "info", "route", "Server started on port 3000");

// Or use convenience wrappers
await Logger.error("backend", "db", "Critical database connection failure.");
await Logger.debug("backend", "controller", "Processing request for depot list");
```

## API

### `initLogger(config)`
Initialise with your auth token. Call once at startup.

### `Log(stack, level, package, message)`
Send a log entry. All parameters must be lowercase valid values.

**stack**: `"backend"` | `"frontend"`  
**level**: `"debug"` | `"info"` | `"warn"` | `"error"` | `"fatal"`  
**package (backend)**: `cache` | `controller` | `cron_job` | `db` | `domain` | `handler` | `repository` | `route` | `service`  
**package (frontend)**: `api` | `component` | `hook` | `page` | `state` | `style`  
**package (shared)**: `auth` | `config` | `middleware` | `utils`

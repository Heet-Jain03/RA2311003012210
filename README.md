# Campus Hiring Evaluation - Backend

## Repository Structure

```
/
├── logging_middleware/          ← Reusable logging package (Pre-Test)
├── vehicle_maintenance_scheduler/  ← Backend Q1: Knapsack scheduler
├── notification_app_be/         ← Backend Q2: Notification microservice (Stages 1-6)
├── notification_system_design.md   ← Stages 1-6 design document
├── auth.ts                      ← One-time registration + auth script
└── .gitignore
```

## Setup Order

### Step 1: Register and get your token
```bash
# Edit auth.ts and fill in your details, then:
npx ts-node auth.ts
# Save clientID, clientSecret, and access_token
```

### Step 2: Build logging_middleware
```bash
cd logging_middleware
npm install
npm run build
```

### Step 3: Run Vehicle Maintenance Scheduler
```bash
cd vehicle_maintenance_scheduler
npm install
AUTH_TOKEN=your_token npx ts-node src/index.ts
# Take a screenshot of the output
```

### Step 4: Run Notification Backend
```bash
cd notification_app_be
npm install
AUTH_TOKEN=your_token npx ts-node src/index.ts
# Test with Postman/Insomnia:
# GET http://localhost:4000/api/notifications
# GET http://localhost:4000/api/notifications/priority?top=10
```

## API Endpoints (notification_app_be)

| Method | URL | Description |
|--------|-----|-------------|
| GET | /health | Health check |
| GET | /api/notifications | All notifications |
| GET | /api/notifications/priority?top=10 | Priority inbox top N |

# 🛒 Hyperlocal Marketplace Architecture

<div align="center">
  <img src="https://img.shields.io/badge/Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Android" />
  <img src="https://img.shields.io/badge/Kotlin-0095D5?style=for-the-badge&logo=kotlin&logoColor=white" alt="Kotlin" />
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
</div>

<br/>

A production-grade, highly scalable hyperlocal marketplace platform. Engineered with a strict **Clean Architecture**, this system handles real-time live map tracking, transactional inventory locking, and offline-first mobile caching.

## ✨ Core Architecture Highlights

* **Offline-First Edge Caching:** Implements the Network-Bound Resource pattern using Room DB (SQLite) to ensure the app functions seamlessly during network drops.
* **Real-Time State Machines:** Targeted WebSocket Pub/Sub routing for instant order progression and Uber-like driver map tracking.
* **Transactional Integrity:** Utilizes PostgreSQL `FOR UPDATE NOWAIT` row-level locking to prevent race conditions and inventory overselling during checkout.
* **Spatial Queries:** Powered by PostGIS for lightning-fast, radius-based merchant discovery.
* **Multi-Channel Notifications:** Concurrent `Promise.allSettled` execution of FCM Push Notifications and Twilio SMS for fault-tolerant alerting.

---

## 🚀 Hyperlocal Marketplace: Windows 10 Deployment Guide

As a DevOps Engineer, the cleanest way to run this on Windows 10 without cluttering your system registry is to containerize the database and run the backend locally.

### Phase 1: Environment Preparation

**Enable WSL2 & Docker Desktop:**
* If you haven't already, install Docker Desktop for Windows.
* Ensure it is configured to use the WSL2 backend (`Settings -> General -> Use the WSL 2 based engine`).
* *Optional but recommended for an Arch user:* You can actually install Arch Linux on WSL2, but default Ubuntu works perfectly for the Node.js runtime.

**Install Node.js & TypeScript:**
* Install Node.js (v20+ recommended) either via `nvm-windows` natively or inside your WSL2 distro.
* Install TypeScript globally: 
  ```bash
  npm install -g typescript ts-node
  ```

**Install Android Studio:**
* Download and install Android Studio.
* Set up an Android Virtual Device (AVD) running API 34.

### Phase 2: Database Deployment (PostgreSQL + PostGIS)

Running PostGIS natively on Windows is notoriously messy. We will use a `docker-compose.yml` file to spin it up perfectly.

1. Navigate to your generated project folder in PowerShell or WSL:
   ```bash
   cd hyperlocal-marketplace/backend/db
   ```

2. Create a `docker-compose.yml` file in that folder:
   ```yaml
   version: '3.8'
   services:
     db:
       image: postgis/postgis:15-3.3
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: supersecretpassword
         POSTGRES_DB: hyperlocal
       ports:
         - "5432:5432"
       volumes:
         - pgdata:/var/lib/postgresql/data
   volumes:
     pgdata:
   ```

3. Spin up the database:
   ```bash
   docker-compose up -d
   ```

4. Apply the `schema.sql` to your new Docker database:
   ```bash
   docker exec -i $(docker-compose ps -q db) psql -U postgres -d hyperlocal < schema.sql
   ```
   *Your database is now live on `localhost:5432` with all schemas and indexes created.*

### Phase 3: Backend Deployment (Node.js)

1. Navigate to the backend source directory:
   ```bash
   cd ../src
   ```

2. Initialize the Node project and create a `tsconfig.json`:
   ```bash
   npm init -y
   tsc --init
   ```

3. Install the required dependencies:
   ```bash
   # Core dependencies
   npm install express ws jsonwebtoken pg express-rate-limit firebase-admin twilio

   # TypeScript types (Dev dependencies)
   npm install -D @types/express @types/ws @types/jsonwebtoken @types/pg @types/node
   ```

4. Create a `.env` file in the `src` directory with your local credentials:
   ```env
   PORT=3000
   JWT_SECRET=super-secret-local-dev-key
   PGUSER=postgres
   PGPASSWORD=supersecretpassword
   PGHOST=localhost
   PGPORT=5432
   PGDATABASE=hyperlocal
   ```

5. Start the server:
   ```bash
   ts-node server.ts
   ```
   *You should see: `API + WS Server running on port 3000`.*

### Phase 4: Android App Deployment (Android Studio)

**Open the Project:**
* Launch Android Studio.
* Click Open and select the `hyperlocal-marketplace/android` directory.

**Add Dependencies:**
Open your `app/build.gradle.kts` and ensure you have the required libraries:
```kotlin
dependencies {
    // Compose Material 3
    implementation("androidx.compose.material3:material3:1.2.0")

    // Maps
    implementation("com.google.maps.android:maps-compose:4.3.0")
    implementation("com.google.android.gms:play-services-maps:18.2.0")

    // Retrofit & OkHttp
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Room Database
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1") // Requires KSP plugin
}
```

**The Localhost Emulator Rule (CRITICAL):**
Since you are running the Node.js server on your Windows machine (`localhost:3000`), the Android Emulator cannot use localhost (that points to the emulator itself). Change the URL from localhost to the Android loopback IP:
* `http://10.0.2.2:3000` *(for REST API)*
* `ws://10.0.2.2:3000/ws/tracking` *(for WebSockets)*

**Run the App:**
* Select your API 34 Emulator and click the Green **Run** (Play) button.

### 🛡️ Architecture Validation
At this point:
1. Your PostGIS database is running in Docker.
2. Your Node/Express server is routing REST and WS traffic.
3. Your Compose UI is rendering on the emulator.

*If you encounter a `Cleartext HTTP traffic not permitted` error on Android (since we aren't using HTTPS locally), add `android:usesCleartextTraffic="true"` to your `<application>` tag in `AndroidManifest.xml`.*

---
<div align="center">
  <i>Engineered for Performance and Scale.</i>
</div>
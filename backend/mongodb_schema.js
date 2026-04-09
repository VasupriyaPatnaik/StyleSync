// Run in mongosh for a local MongoDB instance or Atlas cluster.
// Example: mongosh "mongodb://localhost:27017/stylesync" backend/mongodb_schema.js

db = db.getSiblingDB("stylesync");

// Collections
const collections = ["scraped_sites", "design_tokens", "locked_tokens", "version_history", "counters"];
collections.forEach((name) => {
  if (!db.getCollectionNames().includes(name)) {
    db.createCollection(name);
  }
});

// Indexes

// scraped_sites
// site_id is the stable identifier used by API routes.
db.scraped_sites.createIndex({ site_id: 1 }, { unique: true });
db.scraped_sites.createIndex({ url: 1 });

// design_tokens
// One token record per scraped site.
db.design_tokens.createIndex({ site_id: 1 }, { unique: true });

// locked_tokens
// Multiple locks per site, one per token path.
db.locked_tokens.createIndex({ site_id: 1, token_path: 1 }, { unique: true });

// version_history
// Time-ordered snapshots for restore/time-machine functionality.
db.version_history.createIndex({ site_id: 1, created_at: -1 });

// Counter seed for incremental site IDs.
db.counters.updateOne(
  { _id: "site_id" },
  { $setOnInsert: { seq: 0 } },
  { upsert: true }
);

print("StyleSync MongoDB schema and indexes are ready.");

import { db } from "./index";
import { usersTable } from "./schema/users";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const demoUsers = [
  {
    name: "Priya Sharma",
    email: "retailbuyer1@omnibid.test",
    password: "Password@123",
    role: "retail_buyer",
    city: "Hyderabad",
    isProfileComplete: true,
  },
  {
    name: "Reliance Procurement (Demo)",
    email: "enterprisebuyer1@omnibid.test",
    password: "Password@123",
    role: "enterprise_buyer",
    city: "Mumbai",
    isProfileComplete: true,
    gstNumber: "27AAACR1234A1Z1",
  },
  {
    name: "Ramesh (Plumber)",
    email: "plumber1@omnibid.test",
    password: "Password@123",
    role: "solo_provider",
    city: "Hyderabad",
    isProfileComplete: true,
    aadhaarVerified: true,
  },
  {
    name: "StarCrew Agency",
    email: "agency1@omnibid.test",
    password: "Password@123",
    role: "agency_provider",
    city: "Mumbai",
    isProfileComplete: true,
    gstNumber: "27AAACS5678B1Z2",
    crewSize: 12,
  },
];

async function seedDemo() {
  console.log("Seeding demo personas...");
  for (const user of demoUsers) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, user.email));
    if (!existing.length) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      const { password, ...userData } = user;
      await db.insert(usersTable).values({ ...userData, passwordHash } as any);
      console.log(`Inserted: ${user.name} (${user.role})`);
    } else {
      console.log(`Skipped: ${user.name} (already exists)`);
    }
  }
  console.log("Demo seeding complete!");
}

seedDemo().catch(console.error).finally(() => process.exit());

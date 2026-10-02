import { Address, Job, WorkerProfile, Skill, taxonomy } from "./models";
export const home: Address = {
  id: "home",
  label: "Home",
  street: "184 Wythe Avenue",
  unit: "Apt 4B",
  city: "Brooklyn, NY 11249",
  zone: "Williamsburg",
  coordinates: { latitude: 40.7188, longitude: -73.9602 },
  instructions: "Buzzer 4B. Take the elevator to the fourth floor.",
};
const names = [
  "Mike Rivera",
  "Sarah Chen",
  "James Walker",
  "Alex Morgan",
  "Daniel Brooks",
  "Sofia Reyes",
  "Marcus Hill",
  "Emma Davis",
  "Luis Torres",
  "Nina Patel",
  "Chris Park",
  "Olivia Reed",
  "Ben Carter",
  "Maya Johnson",
  "Noah Wilson",
  "Zoe Martin",
  "Ethan King",
  "Ava Lopez",
  "Leo Kim",
  "Isla Scott",
  "Owen Green",
  "Ruby Wright",
  "Jack Lewis",
  "Ivy Adams",
  "Max Young",
  "Ella Allen",
  "Sam Garcia",
  "Lily Baker",
];
const skills = Object.values(taxonomy).flat();
export const workers: WorkerProfile[] = names.map((name, i) => {
  const primary: Skill =
    i === 0
      ? "plumbing.leak"
      : i === 1
        ? "assembly.furniture"
        : i === 2
          ? "general.repair"
          : i <= 14
            ? skills[i - 3]
            : i % 3 === 0
              ? "plumbing.leak"
              : skills[i % skills.length];
  const completed = i === 27 ? 3 : 72 + ((i * 137 + 256) % 780);
  return {
    id: `worker-${i}`,
    name,
    email: `demo-${i}@example.invalid`,
    role: "worker",
    color: ["#70685d", "#59716d", "#6e657b", "#766248"][i % 4],
    avatar:
      i < 3 ? `https://i.pravatar.cc/120?img=${[12, 47, 13][i]}` : undefined,
    skills: [
      ...new Set([
        primary,
        "general.repair",
        ...(i % 3 === 0 ? ["plumbing.drain"] : []),
      ]),
    ].map((skill) => ({
      skill: skill as Skill,
      confidence: 0.78 + (i % 5) * 0.04,
      verified: i % 4 !== 3,
      completed: Math.floor(completed / 2),
    })),
    licenses:
      primary === "electrical.fixture" || primary === "hvac.service"
        ? [
            {
              id: `license-${i}`,
              skill: primary,
              jurisdiction: "NY",
              expiresAt: "2028-01-01",
              verified: i % 5 !== 1,
            },
          ]
        : [],
    metrics: {
      rating: i === 0 ? 4.93 : 4.68 + (i % 7) * 0.045,
      reviews: completed,
      completed,
      completion: 0.96 + (i % 4) * 0.009,
      cancellation: 0.012 + (i % 4) * 0.012,
      response: 0.84 + (i % 5) * 0.03,
      acceptance: 0.62 + (i % 4) * 0.06,
      punctuality: 0.88 + (i % 5) * 0.025,
      durationAccuracy: 0.86 + (i % 4) * 0.035,
      complaints: 0.004 * (i % 3),
      refunds: 0.003,
      disputes: 0.001,
      repeat: 0.25 + (i % 5) * 0.08,
      recentQuality: 0.91 + (i % 4) * 0.02,
    },
    available: i % 7 !== 6,
    standing: "good",
    location: {
      latitude: home.coordinates.latitude + Math.sin(i * 1.7) * 0.025,
      longitude: home.coordinates.longitude + Math.cos(i * 2.3) * 0.022,
    },
    serviceRadiusKm: 9,
    minimumPay: 58 + (i % 7) * 12,
    utilization: 0.25 + (i % 4) * 0.14,
    heading: (i * 43) % 360,
    identityVerified: true,
    backgroundCheck: i % 5 ? "verified" : "pending",
    insured: i % 3 !== 2,
    bio:
      i === 0
        ? "Your neighborhood problem solver. 8 years making Brooklyn homes work better. Clean work, clear communication, no surprises."
        : "Thoughtful work and a home left better than I found it. Proud to help my Brooklyn neighbors.",
  };
});
export const makeDraft = (): Job => ({
  id: `job-${Date.now()}`,
  customerId: "customer-demo",
  title: "",
  description: "",
  category: "Plumbing",
  skill: "plumbing.leak",
  status: "draft",
  address: { ...home },
  urgency: "now",
  offer: 145,
  duration: 45,
  complexity: "small",
  photos: [],
  createdAt: new Date().toISOString(),
  requiresLicense: false,
  tip: 0,
});
export const pastJobs: Job[] = [
  {
    ...makeDraft(),
    id: "past-1",
    title: "Living room shelves",
    category: "Mounting",
    skill: "mounting.tv",
    status: "completed",
    workerId: "worker-1",
    offer: 95,
    createdAt: "2026-09-26T14:00:00Z",
  },
  {
    ...makeDraft(),
    id: "past-2",
    title: "Kitchen faucet repair",
    status: "completed",
    workerId: "worker-0",
    offer: 120,
    createdAt: "2026-09-18T14:00:00Z",
  },
  {
    ...makeDraft(),
    id: "past-3",
    title: "A desk that finally fits",
    category: "Assembly",
    skill: "assembly.furniture",
    status: "completed",
    workerId: "worker-2",
    offer: 85,
    createdAt: "2026-09-08T14:00:00Z",
  },
];

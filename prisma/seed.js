import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Clear existing data (optional - comment out in production)
  console.log('Clearing existing data...');
  await prisma.report.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.spot.deleteMany();
  await prisma.beacon.deleteMany();
  await prisma.message.deleteMany();
  await prisma.session.deleteMany();
  await prisma.device.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.featureFlag.deleteMany();
  await prisma.user.deleteMany();

  // Create sample users
  console.log('Creating users...');
  const passwordHash = await bcrypt.hash('password123', 12);

  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'alice@example.com',
        passwordHash,
        displayName: 'Alice Johnson',
        age: 25,
        bio: 'Coffee enthusiast and book lover',
        tags: ['coffee', 'books', 'hiking'],
        photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
        lat: 40.7128,
        lng: -74.0060,
        isVerified: true,
        reputation: 85
      }
    }),
    prisma.user.create({
      data: {
        email: 'bob@example.com',
        passwordHash,
        displayName: 'Bob Smith',
        age: 28,
        bio: 'Tech geek and gaming fan',
        tags: ['gaming', 'tech', 'movies'],
        photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
        lat: 40.7580,
        lng: -73.9855,
        isVerified: true,
        reputation: 92
      }
    }),
    prisma.user.create({
      data: {
        email: 'charlie@example.com',
        passwordHash,
        displayName: 'Charlie Davis',
        age: 23,
        bio: 'Fitness enthusiast and outdoor adventurer',
        tags: ['fitness', 'hiking', 'photography'],
        photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
        lat: 40.7489,
        lng: -73.9680,
        isVerified: false,
        reputation: 73
      }
    }),
    prisma.user.create({
      data: {
        email: 'diana@example.com',
        passwordHash,
        displayName: 'Diana Martinez',
        age: 27,
        bio: 'Artist and music lover',
        tags: ['art', 'music', 'coffee'],
        photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana',
        lat: 40.7306,
        lng: -73.9352,
        isVerified: true,
        reputation: 88
      }
    }),
    prisma.user.create({
      data: {
        email: 'evan@example.com',
        passwordHash,
        displayName: 'Evan Wilson',
        age: 30,
        bio: 'Entrepreneur and startup enthusiast',
        tags: ['business', 'tech', 'networking'],
        photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=evan',
        lat: 40.7614,
        lng: -73.9776,
        isVerified: true,
        reputation: 95
      }
    })
  ]);

  console.log(`Created ${users.length} users`);

  // Create venues
  console.log('Creating venues...');
  const venues = await Promise.all([
    prisma.venue.create({
      data: {
        name: 'Central Perk Coffee',
        kind: 'cafe',
        description: 'Cozy coffee shop with great atmosphere',
        lat: 40.7589,
        lng: -73.9851,
        address: '123 Broadway, New York, NY',
        verified: true
      }
    }),
    prisma.venue.create({
      data: {
        name: 'The Blue Note Jazz Club',
        kind: 'club',
        description: 'Historic jazz club with live music',
        lat: 40.7308,
        lng: -74.0014,
        address: '131 W 3rd St, New York, NY',
        verified: true
      }
    }),
    prisma.venue.create({
      data: {
        name: 'Madison Square Park',
        kind: 'park',
        description: 'Beautiful urban park in Midtown',
        lat: 40.7432,
        lng: -73.9877,
        address: 'Madison Ave & E 23rd St, New York, NY',
        verified: true
      }
    }),
    prisma.venue.create({
      data: {
        name: 'Gold\'s Gym',
        kind: 'gym',
        description: 'Full-service fitness center',
        lat: 40.7505,
        lng: -73.9934,
        address: '160 W 38th St, New York, NY',
        verified: true
      }
    })
  ]);

  console.log(`Created ${venues.length} venues`);

  // Create beacons
  console.log('Creating beacons...');
  const beacons = await Promise.all([
    prisma.beacon.create({
      data: {
        userId: users[0].id,
        title: 'Coffee at Central Perk?',
        category: 'coffee',
        description: 'Looking for someone to grab coffee with!',
        lat: 40.7589,
        lng: -73.9851,
        radiusMeters: 500,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
        active: true
      }
    }),
    prisma.beacon.create({
      data: {
        userId: users[1].id,
        title: 'Gaming session tonight',
        category: 'gaming',
        description: 'Playing some games, anyone want to join?',
        lat: 40.7580,
        lng: -73.9855,
        radiusMeters: 1000,
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
        active: true
      }
    }),
    prisma.beacon.create({
      data: {
        userId: users[2].id,
        title: 'Morning run in the park',
        category: 'sports',
        description: 'Going for a 5k run, join me!',
        lat: 40.7432,
        lng: -73.9877,
        radiusMeters: 800,
        expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour
        active: true
      }
    })
  ]);

  console.log(`Created ${beacons.length} beacons`);

  // Create spots
  console.log('Creating user-generated spots...');
  const spots = await Promise.all([
    prisma.spot.create({
      data: {
        userId: users[3].id,
        title: 'Best sunset view',
        note: 'Amazing spot to watch the sunset over the city',
        lat: 40.7614,
        lng: -73.9776,
        approved: true
      }
    }),
    prisma.spot.create({
      data: {
        userId: users[4].id,
        title: 'Hidden gem cafe',
        note: 'Small cafe with incredible pastries, not many people know about it',
        lat: 40.7306,
        lng: -73.9352,
        approved: true
      }
    })
  ]);

  console.log(`Created ${spots.length} spots`);

  // Create messages
  console.log('Creating messages...');
  const messages = await Promise.all([
    prisma.message.create({
      data: {
        senderId: users[0].id,
        recipientId: users[1].id,
        content: 'Hey! Saw your gaming beacon. What are you playing?'
      }
    }),
    prisma.message.create({
      data: {
        senderId: users[1].id,
        recipientId: users[0].id,
        content: 'Just started a new RPG. Want to join?'
      }
    }),
    prisma.message.create({
      data: {
        senderId: users[2].id,
        recipientId: users[3].id,
        content: 'Love your art! Do you do commissions?'
      }
    })
  ]);

  console.log(`Created ${messages.length} messages`);

  // Create subscriptions
  console.log('Creating subscriptions...');
  const subscription = await prisma.subscription.create({
    data: {
      userId: users[1].id,
      stripeSubscriptionId: 'sub_demo_' + Math.random().toString(36).substring(7),
      status: 'active',
      plan: 'premium',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    }
  });

  console.log('Created 1 subscription');

  // Create feature flags
  console.log('Creating feature flags...');
  const flags = await Promise.all([
    prisma.featureFlag.create({
      data: {
        key: 'enable_video_messages',
        enabled: false,
        description: 'Allow users to send video messages'
      }
    }),
    prisma.featureFlag.create({
      data: {
        key: 'enable_voice_notes',
        enabled: true,
        description: 'Allow users to send voice notes'
      }
    }),
    prisma.featureFlag.create({
      data: {
        key: 'enable_ai_matching',
        enabled: false,
        description: 'Use AI for profile matching recommendations'
      }
    })
  ]);

  console.log(`Created ${flags.length} feature flags`);

  console.log('\n✅ Database seeded successfully!');
  console.log('\nSample credentials:');
  console.log('Email: alice@example.com');
  console.log('Password: password123');
  console.log('\nOther users: bob@example.com, charlie@example.com, diana@example.com, evan@example.com');
  console.log('All passwords: password123');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

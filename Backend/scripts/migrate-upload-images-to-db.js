require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const db = require('../src/config/db');
const { createMediaFromLocalFile, getMediaUrl } = require('../src/shared/utils/media');

const backendRoot = path.resolve(__dirname, '..');

async function migratePeopleAvatars() {
  const [people] = await db.query(
    `SELECT p.id, p.clan_id, p.avatar_url, p.pending_avatar_url,
            p.avatar_media_id, p.pending_avatar_media_id,
            a.id AS account_id
     FROM people p
     LEFT JOIN accounts a ON a.person_id = p.id`
  );

  let migrated = 0;
  for (const person of people) {
    if (person.avatar_url && !person.avatar_media_id) {
      const mediaId = await createMediaFromLocalFile({
        rawUrlOrPath: person.avatar_url,
        usageType: 'avatar',
        ownerAccountId: person.account_id || null,
        ownerPersonId: person.id,
        clanId: person.clan_id || null,
        backendRoot,
      });
      if (mediaId) {
        await db.query('UPDATE people SET avatar_media_id = ?, avatar_url = ? WHERE id = ?', [mediaId, `/api/media/${mediaId}`, person.id]);
        migrated += 1;
      }
    }

    if (person.pending_avatar_url && !person.pending_avatar_media_id) {
      const mediaId = await createMediaFromLocalFile({
        rawUrlOrPath: person.pending_avatar_url,
        usageType: 'pending_avatar',
        ownerAccountId: person.account_id || null,
        ownerPersonId: person.id,
        clanId: person.clan_id || null,
        backendRoot,
      });
      if (mediaId) {
        await db.query('UPDATE people SET pending_avatar_media_id = ?, pending_avatar_url = ? WHERE id = ?', [mediaId, `/api/media/${mediaId}`, person.id]);
        migrated += 1;
      }
    }
  }
  return migrated;
}

async function migratePostImages() {
  const [posts] = await db.query(
    `SELECT p.id, p.clan_id, p.author_id, p.image_url, p.image_media_id, a.person_id
     FROM posts p
     LEFT JOIN accounts a ON a.id = p.author_id
     WHERE p.image_url IS NOT NULL AND p.image_url != ''`
  );

  let migrated = 0;
  for (const post of posts) {
    if (post.image_media_id) continue;
    const mediaId = await createMediaFromLocalFile({
      rawUrlOrPath: post.image_url,
      usageType: 'post_image',
      ownerAccountId: post.author_id || null,
      ownerPersonId: post.person_id || null,
      clanId: post.clan_id || null,
      backendRoot,
    });
    if (mediaId) {
      await db.query('UPDATE posts SET image_media_id = ?, image_url = ? WHERE id = ?', [mediaId, `/api/media/${mediaId}`, post.id]);
      migrated += 1;
    }
  }
  return migrated;
}

async function main() {
  const avatars = await migratePeopleAvatars();
  const posts = await migratePostImages();
  console.log(`Done. Migrated avatars: ${avatars}, post images: ${posts}`);
}

main()
  .then(async () => {
    await db.end?.();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    db.end?.()
      .catch(() => {})
      .finally(() => process.exit(1));
  });

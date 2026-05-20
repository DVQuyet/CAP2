ALTER TABLE people
  ADD COLUMN avatar_media_id BIGINT UNSIGNED DEFAULT NULL,
  ADD COLUMN pending_avatar_media_id BIGINT UNSIGNED DEFAULT NULL,
  ADD KEY idx_people_avatar_media (avatar_media_id),
  ADD KEY idx_people_pending_avatar_media (pending_avatar_media_id),
  ADD CONSTRAINT fk_people_avatar_media FOREIGN KEY (avatar_media_id) REFERENCES media_files(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_people_pending_avatar_media FOREIGN KEY (pending_avatar_media_id) REFERENCES media_files(id) ON DELETE SET NULL;

ALTER TABLE posts
  ADD COLUMN image_media_id BIGINT UNSIGNED DEFAULT NULL,
  ADD KEY idx_posts_image_media (image_media_id),
  ADD CONSTRAINT fk_posts_image_media FOREIGN KEY (image_media_id) REFERENCES media_files(id) ON DELETE SET NULL;

ALTER TABLE photo_restorations
  ADD COLUMN original_media_id BIGINT UNSIGNED DEFAULT NULL,
  ADD COLUMN restored_media_id BIGINT UNSIGNED DEFAULT NULL,
  ADD KEY idx_photo_original_media (original_media_id),
  ADD KEY idx_photo_restored_media (restored_media_id),
  ADD CONSTRAINT fk_photo_original_media FOREIGN KEY (original_media_id) REFERENCES media_files(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_photo_restored_media FOREIGN KEY (restored_media_id) REFERENCES media_files(id) ON DELETE SET NULL;

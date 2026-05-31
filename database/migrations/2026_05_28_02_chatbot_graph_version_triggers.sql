SET NAMES utf8mb4;

DROP TRIGGER IF EXISTS trg_chatbot_families_insert_version;
DROP TRIGGER IF EXISTS trg_chatbot_families_update_version;
DROP TRIGGER IF EXISTS trg_chatbot_families_delete_version;
DROP TRIGGER IF EXISTS trg_chatbot_children_insert_version;
DROP TRIGGER IF EXISTS trg_chatbot_children_update_version;
DROP TRIGGER IF EXISTS trg_chatbot_children_delete_version;

DELIMITER $$

CREATE TRIGGER trg_chatbot_families_insert_version
AFTER INSERT ON families
FOR EACH ROW
BEGIN
  INSERT INTO family_graph_versions (clan_id, graph_version)
  VALUES (NEW.clan_id, 2)
  ON DUPLICATE KEY UPDATE graph_version = graph_version + 1;
END$$

CREATE TRIGGER trg_chatbot_families_update_version
AFTER UPDATE ON families
FOR EACH ROW
BEGIN
  INSERT INTO family_graph_versions (clan_id, graph_version)
  VALUES (NEW.clan_id, 2)
  ON DUPLICATE KEY UPDATE graph_version = graph_version + 1;
  IF OLD.clan_id <> NEW.clan_id THEN
    INSERT INTO family_graph_versions (clan_id, graph_version)
    VALUES (OLD.clan_id, 2)
    ON DUPLICATE KEY UPDATE graph_version = graph_version + 1;
  END IF;
END$$

CREATE TRIGGER trg_chatbot_families_delete_version
AFTER DELETE ON families
FOR EACH ROW
BEGIN
  INSERT INTO family_graph_versions (clan_id, graph_version)
  VALUES (OLD.clan_id, 2)
  ON DUPLICATE KEY UPDATE graph_version = graph_version + 1;
END$$

CREATE TRIGGER trg_chatbot_children_insert_version
AFTER INSERT ON children
FOR EACH ROW
BEGIN
  INSERT INTO family_graph_versions (clan_id, graph_version)
  SELECT f.clan_id, 2
  FROM families f
  WHERE f.id = NEW.family_id
  ON DUPLICATE KEY UPDATE graph_version = graph_version + 1;
END$$

CREATE TRIGGER trg_chatbot_children_update_version
AFTER UPDATE ON children
FOR EACH ROW
BEGIN
  INSERT INTO family_graph_versions (clan_id, graph_version)
  SELECT f.clan_id, 2
  FROM families f
  WHERE f.id IN (OLD.family_id, NEW.family_id)
  ON DUPLICATE KEY UPDATE graph_version = graph_version + 1;
END$$

CREATE TRIGGER trg_chatbot_children_delete_version
AFTER DELETE ON children
FOR EACH ROW
BEGIN
  INSERT INTO family_graph_versions (clan_id, graph_version)
  SELECT f.clan_id, 2
  FROM families f
  WHERE f.id = OLD.family_id
  ON DUPLICATE KEY UPDATE graph_version = graph_version + 1;
END$$

DELIMITER ;

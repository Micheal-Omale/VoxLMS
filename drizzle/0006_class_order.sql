-- Spec 0006: classes list level by level, arms in order (the level's order × 10 + the arm's position).
-- Renumbers existing classes to the same rule new classes follow; a class with no arm is position 0.
UPDATE "class" c SET "sort_order" = numbered.n
FROM (
  SELECT
    k."id",
    (l."sort_order" * 10 + CASE
      WHEN k."arm" IS NULL THEN 0
      ELSE least(row_number() OVER (PARTITION BY k."school_id", k."standard_level_id", k."arm" IS NULL ORDER BY k."sort_order", k."name", k."id"), 9)
    END)::integer AS n
  FROM "class" k
  JOIN "standard_level" l ON l."id" = k."standard_level_id"
) numbered
WHERE numbered."id" = c."id";

-- A listing published before PropertyListing carried a country of its own has
-- none, so it appears in the shopfront but in no country's row: the three rows
-- already live when the column was added were invisible to "Places in Kenya".
--
-- The property it belongs to always knew. Inheriting from there is both the
-- correct answer for those rows and the right general rule — a listing without
-- a stated country is in the same country as the building it is part of.
--
-- Only NULLs are touched. A listing that states its own country keeps it, which
-- matters because the two can legitimately differ: an agency's property record
-- is where the agency is, and the flat it is selling may be somewhere else.
UPDATE "PropertyListing" AS pl
SET "country" = p."country"
FROM "Property" AS p
WHERE pl."propertyId" = p."id"
  AND pl."country" IS NULL
  AND p."country" IS NOT NULL;

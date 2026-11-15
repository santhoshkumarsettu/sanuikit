CREATE TYPE "UnitPurpose" AS ENUM ('SALE', 'AMENITY');

ALTER TABLE "units"
ADD COLUMN "purpose" "UnitPurpose" NOT NULL DEFAULT 'SALE';

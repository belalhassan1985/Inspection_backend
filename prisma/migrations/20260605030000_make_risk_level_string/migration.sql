-- AlterTable: change campaign_recommendations.risk_level from RiskLevel enum to VARCHAR(50)
ALTER TABLE "campaign_recommendations" 
  ALTER COLUMN "risk_level" TYPE VARCHAR(50) 
  USING "risk_level"::text;

-- AlterTable: change recommendation_tracking.risk_level from RiskLevel enum to VARCHAR(50)
ALTER TABLE "recommendation_tracking" 
  ALTER COLUMN "risk_level" TYPE VARCHAR(50) 
  USING "risk_level"::text;
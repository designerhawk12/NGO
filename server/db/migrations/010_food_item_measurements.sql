-- Preserve the original quantity/unit contract while allowing a donor to record
-- both servings and weight for each newly submitted food item. Old rows stay null.
ALTER TABLE app.food_items
  ADD COLUMN estimated_meals numeric(12,2) CHECK (estimated_meals > 0),
  ADD COLUMN estimated_weight_kg numeric(10,2) CHECK (estimated_weight_kg > 0);

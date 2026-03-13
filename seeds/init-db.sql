-- Idempotent: only seed if the table does not exist or is empty
DO $$
BEGIN
    -- Create table if it does not exist
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'records') THEN
        CREATE TABLE records (
            id BIGSERIAL PRIMARY KEY,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            name VARCHAR(255) NOT NULL,
            value DECIMAL(18, 4) NOT NULL,
            metadata JSONB NOT NULL
        );
    END IF;

    -- Only seed if the table is empty
    IF (SELECT COUNT(*) FROM records) = 0 THEN
        RAISE NOTICE 'Seeding 10,000,000 rows into records table...';

        -- Insert in batches of 1,000,000 for better memory management
        INSERT INTO records (name, value, metadata, created_at)
        SELECT
            'Record ' || gs,
            (random() * 1000000)::DECIMAL(18,4),
            jsonb_build_object(
                'description', 'Sample description for record ' || gs,
                'tags', jsonb_build_array(
                    'tag' || (random() * 10)::int,
                    'tag' || (random() * 10)::int
                ),
                'attributes', jsonb_build_object(
                    'priority', (random() * 5)::int,
                    'category', 'cat' || (random() * 20)::int
                )
            ),
            NOW() - (random() * interval '365 days')
        FROM generate_series(1, 10000000) AS gs;

        RAISE NOTICE 'Seeding complete.';
    ELSE
        RAISE NOTICE 'Table records already seeded, skipping.';
    END IF;

    -- Create index if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_records_created_at') THEN
        CREATE INDEX idx_records_created_at ON records(created_at);
    END IF;

    -- Create index on id for cursor performance
    -- (primary key already creates this, but just in case)

END $$;
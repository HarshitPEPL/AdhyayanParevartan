import { createClient } from '@supabase/supabase-js';

const url = 'https://oyvomnjeytgwontiucxl.supabase.co';
const key = 'sb_publishable_aRexYK8jj0VuC2aNZd8c6Q_UABVo0M4';

const supabase = createClient(url, key);

async function addTestUsers() {
    console.log('Adding test users to Supabase...');
    
    const testUsers = [
        {
            role_id: 3,
            full_name: 'Google Reviewer',
            email: 'google.reviewer@parevartan.com',
            password_hash: 'TestReview@2024',
            class_number: 9,
            is_approved: 1
        },
        {
            role_id: 3,
            full_name: 'Rahul Kumar',
            email: 'rahul@example.com',
            password_hash: 'password123',
            class_number: 9,
            is_approved: 1
        },
        {
            role_id: 3,
            full_name: 'Rahul',
            email: 'rahul@parevartan.com',
            password_hash: 'Testing',
            class_number: 4,
            is_approved: 1
        }
    ];

    for (const user of testUsers) {
        try {
            const { data, error } = await supabase
                .from('users')
                .upsert([user], { onConflict: 'email' });
            
            if (error) {
                console.error(`Failed to add ${user.email}:`, error);
            } else {
                console.log(`✓ Added/Updated: ${user.email}`);
            }
        } catch (err) {
            console.error(`Error adding ${user.email}:`, err);
        }
    }
    
    console.log('\nTest users setup complete!');
}

addTestUsers().catch(console.error);

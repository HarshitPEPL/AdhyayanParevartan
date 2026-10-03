import { createClient } from '@supabase/supabase-js';
import CryptoJS from 'crypto-js';

const url = 'https://oyvomnjeytgwontiucxl.supabase.co';
const key = 'sb_publishable_aRexYK8jj0VuC2aNZd8c6Q_UABVo0M4';

const supabase = createClient(url, key);

// Hash function using crypto-js for consistency with browser auth.js
function hashPassword(password) {
    return CryptoJS.SHA256(password).toString();
}

async function addTestUsers() {
    console.log('Adding test users to Supabase...');
    
    const testUsers = [
        {
            role_id: 3,
            full_name: 'Google Reviewer',
            email: 'google.reviewer@parevartan.com',
            password_hash: hashPassword('TestReview@2024'),
            class_number: 9,
            is_approved: 1
        },
        {
            role_id: 3,
            full_name: 'Rahul Kumar',
            email: 'rahul@example.com',
            password_hash: hashPassword('password123'),
            class_number: 9,
            is_approved: 1
        },
        {
            role_id: 3,
            full_name: 'Rahul',
            email: 'rahul@parevartan.com',
            password_hash: hashPassword('Testing'),
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
                console.log(`  Email: ${user.email}`);
                console.log(`  Password (plain): ${user.email === 'rahul@parevartan.com' ? 'Testing' : user.email === 'rahul@example.com' ? 'password123' : 'TestReview@2024'}`);
                console.log(`  Class: ${user.class_number}`);
                console.log(`  Approved: ${user.is_approved === 1 ? 'Yes' : 'No'}`);
            }
        } catch (err) {
            console.error(`Error adding ${user.email}:`, err);
        }
    }
    
    console.log('\n✅ Test users setup complete!');
    console.log('\nYou can now login with:');
    console.log('  • rahul@parevartan.com / Testing (Class 4)');
    console.log('  • rahul@example.com / password123 (Class 9)');
    console.log('  • google.reviewer@parevartan.com / TestReview@2024 (Class 9)');
}

addTestUsers().catch(console.error);

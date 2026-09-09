import fs from 'fs';

async function insertUser() {
    const url = 'https://oyvomnjeytgwontiucxl.supabase.co/rest/v1/users';
    const key = 'sb_publishable_aRexYK8jj0VuC2aNZd8c6Q_UABVo0M4';
    
    const body = {
        role_id: 3,
        full_name: 'Rahul Kumar',
        email: 'rahul@example.com',
        password_hash: 'password123',
        class_number: 9,
        board: 'CBSE',
        is_approved: 1
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(body)
        });
        
        if (response.ok || response.status === 201) {
            console.log('User inserted successfully in Supabase');
        } else {
            const text = await response.text();
            console.error('Failed:', response.status, text);
        }
    } catch (err) {
        console.error("Error:", err);
    }
}

insertUser();

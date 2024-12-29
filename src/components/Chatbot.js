import React, { useState } from 'react';
import OpenAI from 'openai';

const Chatbot = () => {
    const [input, setInput] = useState('');
    const [responses, setResponses] = useState([]);

    const openai = new OpenAI({
        apiKey: process.env.REACT_APP_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
    });

    const handleSendMessage = async () => {
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",  // Make sure to use the correct model identifier
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: input },
                ],
            });

            setResponses([...responses, { role: 'user', content: input }, completion.choices[0].message]);
            setInput('');  // Clear input after sending
        } catch (error) {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        }
    };

    return (
        <div>
            <div>
                {responses.map((msg, index) => (
                    <p key={index} style={{ textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                        {msg.content}
                    </p>
                ))}
            </div>
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question"
            />
            <button onClick={handleSendMessage}>Send</button>
        </div>
    );
};

export default Chatbot;

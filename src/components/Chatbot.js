import React, { useState, useEffect } from 'react';
import OpenAI from 'openai';
import { ArrowRight } from "@phosphor-icons/react";
import {
    Card,
    CardBody,
    Typography,
    Input,
    Button,
} from '@material-tailwind/react';

const SuggestionText = ({ text, datasetPhrase }) => {
    const parts = text.split(' in ');
    const beforeIn = parts[0];
    const afterIn = parts[1];

    // Split the text before 'in' into pre-dataset and dataset parts
    const [preDataset, ...rest] = beforeIn.split(new RegExp(`(${datasetPhrase})`, 'i'));
    const dataset = rest.join(''); // Join in case the regex split created multiple parts

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs">{preDataset}</span>
            <div className="bg-purple-50 text-purple-800 px-2 py-1 rounded-md text-xs">
                {datasetPhrase}
            </div>
            {afterIn && (
                <>
                    <span className="text-xs">in</span>
                    <div className="bg-light-green-50 text-light-green-800 px-2 py-1 rounded-md text-xs">
                        {afterIn}
                    </div>
                </>
            )}
        </div>
    );
};

const Chatbot = ({ dataset, onPatternQuestion }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const exampleQuestions = [
        "What's the population density of New York?",
        "Which state has higher population density, New York or Washington?",
        "Which state has the highest population density?",
        "What's the average population density in this map?",
        "Is there a pattern in this map?",
        "Can you describe the pattern in this map?"
    ];

    // Function to handle example question click
    const handleExampleClick = (question) => {
        // Simulate user message
        setMessages(prev => [...prev, { text: question, sender: 'user' }]);
        
        // Send question to API
        handleQuestionSubmit(question);
    };

    // Separated API call logic for reuse
    const handleQuestionSubmit = async (question) => {
        setIsLoading(true);
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/analyze-question`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    question: question,
                    current_dataset: dataset
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('API Response:', data);

            if (data.result) {
                setMessages(prev => [...prev, { text: data.result, sender: 'bot' }]);
                if (data.question_type === 'description') {
                    onPatternQuestion(true);
                }
            } else {
                throw new Error('No result in response');
            }
        } catch (error) {
            console.error('Error details:', error);
            setMessages(prev => [...prev, { 
                text: 'Sorry, I encountered an error. Please try again.',
                sender: 'bot'
            }]);
        }
        setIsLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input;
        setInput('');
        handleQuestionSubmit(userMessage);
    };

    // Add keydown handler for Enter key
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit(e);
        }
    };

    return (
        <CardBody className="flex flex-col h-full p-2">
            <Typography variant="h6" color="blue-gray" className="mb-2">
                MappieTalkie
            </Typography>

            {/* Example Questions Section */}
            <div className="mb-4">
                <Typography variant="small" color="gray" className="mb-2">
                    You can ask me...
                </Typography>
                <div className="flex flex-wrap gap-2">
                    {exampleQuestions.map((question, index) => (
                        <button
                            key={index}
                            onClick={() => handleExampleClick(question)}
                            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition-colors"
                        >
                            {question}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-grow overflow-y-auto mb-2 p-2 bg-gray-50 rounded-md">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} mb-2`}
                    >
                        <div
                            className={`py-2 px-4 rounded-md max-w-[80%] font-['Roboto'] ${
                                msg.sender === 'user'
                                    ? 'bg-teal-100 text-teal-900 text-left text-xs'
                                    : 'bg-gray-200 text-gray-900 text-left text-xs'
                            }`}
                        >
                            <Typography 
                                variant="small" 
                                className="font-['Roboto'] font-normal leading-[1.2]"
                            >
                                {msg.text}
                            </Typography>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start mb-2">
                        <div className="py-2 px-4 rounded-md bg-gray-200 text-gray-900 text-left text-xs">
                            <Typography 
                                variant="small" 
                                className="font-['Roboto'] font-normal leading-[1.2] italic"
                            >
                                Looking for answers...
                            </Typography>
                        </div>
                    </div>
                )}
            </div>

            {/* Input and Button */}
            <div className="flex gap-2 items-center">
                <div className="flex-grow">
                    <Input
                        type="text"
                        label="Ask MappieTalkie"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="font-['Roboto']"
                        labelProps={{
                            className: "!text-teal-500"
                        }}
                        color="teal"
                    />
                </div>
                <Button 
                    onClick={handleSubmit}
                    className='bg-teal-500 text-white p-2.5 aspect-square'
                    size="sm"
                >
                    <ArrowRight size={20} weight="bold" />
                </Button>
            </div>
        </CardBody>
    );
};

export default Chatbot;

import React, { useState, useEffect, useRef } from 'react';
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

const Chatbot = ({ dataset, onPatternQuestion, onStateQuestion }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatContainerRef = useRef(null);

    // List of US states
    const states = [
        'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
        'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
        'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
        'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
        'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
        'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
        'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
        'Wisconsin', 'Wyoming'
    ];

    // Function to get n unique random states
    const getRandomStates = (n) => {
        const shuffled = [...states].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, n);
    };

    // Function to get random example questions
    const getExampleQuestions = () => {
        const [state1, state2, state3] = getRandomStates(3);
        const extrema = Math.random() < 0.5 ? 'highest' : 'lowest';
        
        // Dataset-specific questions
        if (dataset === 'walk_to_wo') {
            return [
                `What percentage of people walk to work in ${state1}?`,
                `Which state has a higher percentage of people walking to work, ${state2} or ${state3}?`,
                `Which state has the ${extrema} percentage of people walking to work?`,
                "What's the average percentage of people who walk to work?",
                "Is there a pattern in this map?",
                "Can you describe the pattern in this map?"
            ];
        } else if (dataset === 'transit_to') {
            return [
                `What percentage of people use public transit in ${state1}?`,
                `Which state has a higher percentage of public transit usage, ${state2} or ${state3}?`,
                `Which state has the ${extrema} percentage of public transit usage?`,
                "What's the average percentage of people who use public transit?",
                "Is there a pattern in this map?",
                "Can you describe the pattern in this map?"
            ];
        } else {  // ppl_densit
            return [
                `What's the population density of ${state1}?`,
                `Which state has higher population density, ${state2} or ${state3}?`,
                `Which state has the ${extrema} population density?`,
                "What's the average population density in this map?",
                "Is there a pattern in this map?",
                "Can you describe the pattern in this map?"
            ];
        }
    };

    // Get fresh example questions whenever dataset changes
    const [exampleQuestions, setExampleQuestions] = useState([]);
    
    useEffect(() => {
        setExampleQuestions(getExampleQuestions());
    }, [dataset]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

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
                
                // Reset map for average, pattern existence, and pattern description questions
                if (['average', 'yes_no', 'description'].includes(data.question_type)) {
                    onStateQuestion(null);  // Reset the map view
                    if (data.question_type === 'description') {
                        onPatternQuestion(true);
                    }
                } else {
                    // Handle state focusing for other question types
                    if (data.question_type === 'state_value' && data.state) {
                        onStateQuestion([data.state]);
                    } else if (data.question_type === 'state_comparison' && data.states) {
                        onStateQuestion(data.states);
                    } else if (data.question_type === 'extrema' && data.state) {
                        onStateQuestion([data.state]);
                    }
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
        // Add user message to chat history first
        setMessages(prev => [...prev, { text: userMessage, sender: 'user' }]);
        // Then submit the question
        handleQuestionSubmit(userMessage);
    };

    // Add keydown handler for Enter key
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit(e);
        }
    };

    // Function to get map description based on dataset
    const getMapDescription = () => {
        switch(dataset) {
            case 'walk_to_wo':
                return "This is a choropleth map of the United States showing the percentage of people who walk to work in each state. Darker shades indicate higher percentages of walking commuters.";
            case 'transit_to':
                return "This is a choropleth map of the United States showing the percentage of people who use public transit in each state. Darker shades indicate higher percentages of public transit usage.";
            default: // ppl_densit
                return "This is a choropleth map of the United States showing population density for each state. Darker shades indicate higher population density.";
        }
    };

    // Function to get general knowledge questions based on dataset
    const getGeneralQuestions = () => {
        switch(dataset) {
            case 'walk_to_wo':
                return [
                    "What's a choropleth map?",
                    "Is there a relationship between population density and the percentage of people who walk to work?"
                ];
            case 'transit_to':
                return [
                    "What's a choropleth map?",
                    "Is there a relationship between population density and public transit usage?"
                ];
            default: // ppl_densit
                return [
                    "What's a choropleth map?",
                    "Is there a relationship between income and population density?"
                ];
        }
    };

    // Get fresh general questions whenever dataset changes
    const [generalQuestions, setGeneralQuestions] = useState([]);
    
    useEffect(() => {
        setExampleQuestions(getExampleQuestions());
        setGeneralQuestions(getGeneralQuestions());
    }, [dataset]);

    return (
        <CardBody className="flex flex-col h-full p-2">
            <Typography variant="h6" color="blue-gray" className="mb-2">
                MappieTalkie
            </Typography>

            {/* Map Description and Example Questions Intro */}
            <Typography variant="small" color="gray" className="mb-4 text-xs">
                <span className="italic">{getMapDescription()}</span>
                {' You can ask me questions like:'}
            </Typography>

            {/* Dataset-specific Questions Section */}
            <div className="mb-2">
                <div className="flex flex-wrap gap-2">
                    {exampleQuestions.map((question, index) => (
                        <button
                            key={index}
                            onClick={() => handleExampleClick(question)}
                            className="px-3 py-1 bg-light-green-50 hover:bg-light-green-100 rounded-full text-xs text-green-900 transition-colors text-left"
                        >
                            {question}
                        </button>
                    ))}
                </div>
            </div>

            {/* General Knowledge Questions Section */}
            <div className="mb-4">
                <Typography variant="small" color="gray" className="mb-2 text-xs">
                    Or ask me about:
                </Typography>
                <div className="flex flex-wrap gap-2">
                    {generalQuestions.map((question, index) => (
                        <button
                            key={index}
                            onClick={() => handleExampleClick(question)}
                            className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left"
                        >
                            {question}
                        </button>
                    ))}
                </div>
            </div>

            <div 
                ref={chatContainerRef}
                className="flex-grow overflow-y-auto mb-2 p-2 bg-gray-50 rounded-md"
            >
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
                                dangerouslySetInnerHTML={{ __html: msg.text }}
                            />
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

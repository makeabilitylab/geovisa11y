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

const Chatbot = ({ 
    selectedStates, 
    onStateRemove, 
    onSpatialClustersChange,
    showSpatialClusters
}) => {
    const [input, setInput] = useState('');
    const [responses, setResponses] = useState([]);
    const [showSuggestion, setShowSuggestion] = useState(false);
    const [suggestion, setSuggestion] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSendMessage = async () => {
        if (!input.trim()) return;

        try {
            setResponses(prev => [...prev, { role: 'user', content: input }]);
            
            setIsLoading(true);

            const spatialPatternKeywords = [
                "spatial pattern",
                "spatial distribution",
                "clustering pattern",
                "density pattern",
                "density distribution"
            ];

            const isSpatialPatternQuestion = spatialPatternKeywords.some(
                keyword => input.toLowerCase().includes(keyword)
            );

            if (isSpatialPatternQuestion) {
                onSpatialClustersChange(true);
            }

            // First try to get analysis from backend
            const response = await fetch(`http://127.0.0.1:5000/api/analyze-density`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    question: input,
                    selected_states: selectedStates.map(state => state.name)
                })
            });

            const data = await response.json();
            console.log('Backend response:', data);

            if (data.result) {
                // If we got a valid analysis from backend, use it
                setResponses(prev => [...prev, { role: 'assistant', content: data.result }]);
            } else {
                console.log('No result from backend, falling back to OpenAI');
                // Fall back to OpenAI for non-density questions
                const openai = new OpenAI({
                    apiKey: process.env.REACT_APP_OPENAI_API_KEY,
                    dangerouslyAllowBrowser: true,
                });

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { 
                            role: 'system', 
                            content: `You are a helpful assistant specializing in spatial data analysis. 
                                     For questions about US states' population density, refer to the data.` 
                        },
                        { role: 'user', content: input },
                    ],
                });

                setResponses(prev => [...prev, completion.choices[0].message]);
            }

            setInput('');
        } catch (error) {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Function to handle input changes with auto-completion
    const handleInputChange = (e) => {
        const newValue = e.target.value;
        setInput(newValue);

        // Check for auto-completion triggers
        const densityTriggers = [
            "what is the population density of",
            "what's the population density of",
            "population density of",
            "how dense is",
            "density of",
            "compare the population density of",
            "compare density of",
            "which state has higher population density:",
            "which state has the higher population density:",
            "which state has the highest population density:",
            "which has higher population density:",
            "which has the highest population density:",
            "which is more densely populated:",
            "which state is more densely populated:",
            "which states are more densely populated:",
        ];

        // Check if the input ends with any of the triggers
        const shouldAutoComplete = densityTriggers.some(trigger => 
            newValue.toLowerCase().endsWith(trigger.toLowerCase())
        ) || (
            // Also check for partial "which" questions that end with a colon
            newValue.toLowerCase().includes('population density') && 
            newValue.toLowerCase().includes('which') && 
            newValue.endsWith(':')
        );

        if (shouldAutoComplete && selectedStates.length > 0) {
            // Create suggestion based on number of states
            const stateNames = selectedStates.map(state => state.name);
            let suggestionText = newValue;
            
            if (stateNames.length === 1) {
                suggestionText = `${newValue} ${stateNames[0]}`;
            } else {
                // For multiple states, use proper grammar
                const lastState = stateNames.pop();
                // Don't add "and" if the question already ends with a colon
                if (newValue.endsWith(':')) {
                    suggestionText = `${newValue} ${stateNames.join(', ')} or ${lastState}`;
                } else {
                    suggestionText = `${newValue} ${stateNames.join(', ')} and ${lastState}`;
                }
            }
            
            setSuggestion(suggestionText);
            setShowSuggestion(true);
        } else {
            setShowSuggestion(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Tab' && showSuggestion) {
            e.preventDefault(); // Prevent default tab behavior
            setInput(suggestion);
            setShowSuggestion(false);
        } else if (e.key === 'Enter') {
            handleSendMessage();
        }
    };

    const handleSuggestionClick = () => {
        setInput(suggestion);
        setShowSuggestion(false);
    };

    const handleSpatialClustersRemove = () => {
        onSpatialClustersChange(false);
    };

    return (
        <Card className="w-full h-full">
            <CardBody className="flex flex-col h-full">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                    MappieTalkie
                </Typography>

                {/* Selected Geographies Section */}
                <div className="mb-4 p-3 rounded-md outline outline-2 outline-blue-gray-50">
                    <Typography variant="small" color="blue-gray" className="font-medium mb-2 text-left">
                        Selected Geographies
                    </Typography>
                    {selectedStates.length === 0 && !showSpatialClusters ? (
                        <Typography variant="small" className="text-gray-600 italic text-left text-xs">
                            Click on areas of interest
                        </Typography>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {selectedStates.map((state) => (
                                <div
                                    key={state.id}
                                    className="bg-light-green-50 text-light-green-800 px-2 py-1 rounded-md text-xs flex items-center gap-1"
                                >
                                    <button
                                        onClick={() => onStateRemove(state.id)}
                                        className="hover:text-light-green-800 focus:outline-none"
                                        aria-label={`Remove ${state.name}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    {state.name}
                                </div>
                            ))}
                            {showSpatialClusters && (
                                <div className="bg-blue-gray-50 text-blue-gray-800 px-2 py-1 rounded-md text-xs flex items-center gap-1">
                                    <button
                                        onClick={handleSpatialClustersRemove}
                                        className="hover:text-blue-gray-800 focus:outline-none"
                                        aria-label="Remove hot and cold spots"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    Hot and Cold Spots
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex-grow overflow-y-auto mb-2 p-2 bg-gray-50 rounded-md">
                    {responses.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}
                        >
                            <div
                                className={`py-2 px-4 rounded-md max-w-[80%] font-['Roboto'] ${
                                    msg.role === 'user'
                                        ? 'bg-teal-100 text-teal-900 text-left text-xs'
                                        : 'bg-gray-200 text-gray-900 text-left text-xs'
                                }`}
                            >
                                <Typography 
                                    variant="small" 
                                    className="font-['Roboto'] font-normal leading-[1.2]"
                                >
                                    {msg.content}
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

                {/* Updated Suggestion UI */}
                {showSuggestion && (
                    <div 
                        className="mb-2 bg-white rounded-md shadow-sm p-2 cursor-pointer hover:bg-gray-50"
                        onClick={handleSuggestionClick}
                    >
                        <div className="flex items-center flex-wrap gap-2">
                            <div className="bg-light-green-50 text-light-green-800 px-2 py-1 rounded-md text-xs">
                                {selectedStates.length === 1 
                                    ? selectedStates[0].name
                                    : selectedStates.map(state => state.name).join(', ').replace(/,([^,]*)$/, ' and$1')
                                }
                            </div>
                            <span className="text-xs text-gray-600">
                                Press Tab or click to complete
                            </span>
                        </div>
                    </div>
                )}

                {/* Input and Button in one row */}
                <div className="flex gap-2 items-center">
                    <div className="flex-grow">
                        <Input
                            type="text"
                            label="Ask MappieTalkie"
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            className="font-['Roboto']"
                            labelProps={{
                                className: "!text-teal-500"
                            }}
                            color="teal"
                        />
                    </div>
                    <Button 
                        onClick={handleSendMessage}
                        className='bg-teal-500 text-white p-2.5 aspect-square'
                        size="sm"
                    >
                        <ArrowRight size={20} weight="bold" />
                    </Button>
                </div>
            </CardBody>
        </Card>
    );
};

export default Chatbot;

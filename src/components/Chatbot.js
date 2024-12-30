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

const Chatbot = ({ selectedStates, onStateRemove }) => {
    const [input, setInput] = useState('');
    const [responses, setResponses] = useState([]);
    const [geoData, setGeoData] = useState(null);
    const [showSuggestion, setShowSuggestion] = useState(false);
    const [suggestion, setSuggestion] = useState('');

    useEffect(() => {
        // Load the GeoJSON data
        fetch('/data/population_density.geojson')
            .then(response => response.json())
            .then(data => {
                // Transform the data for easier access
                const transformedData = {
                    type: "FeatureCollection",
                    features: data.features.map(feature => ({
                        type: "Feature",
                        properties: {
                            name: feature.properties.state_name,
                            ppl_density: feature.properties.ppl_density
                        },
                        geometry: feature.geometry
                    }))
                };
                setGeoData(transformedData);
                console.log("Loaded GeoJSON data:", transformedData);
            })
            .catch(error => {
                console.error('Error loading GeoJSON:', error);
            });
    }, []);

    const analyzeGeoData = (question) => {
        if (!geoData || !geoData.features) {
            console.log("No data available:", geoData);
            return "Sorry, I don't have access to the population density data.";
        }

        const lowerQuestion = question.toLowerCase();
        
        // Only process if the question is specifically about population density
        if (!lowerQuestion.includes('population') && !lowerQuestion.includes('density')) {
            return null;  // Return null to trigger GPT response for non-density questions
        }

        // Check if any state name is mentioned in the question
        const mentionedState = geoData.features.find(feature => 
            lowerQuestion.includes(feature.properties.name.toLowerCase())
        );

        // If no valid state is mentioned in the question, return null to trigger GPT
        if (!mentionedState && !lowerQuestion.includes('compare') && 
            !lowerQuestion.includes('which') && 
            !selectedStates.some(state => 
                lowerQuestion.includes(state.name.toLowerCase())
            )) {
            return null;
        }

        // Handle "which state has higher/highest" questions
        if (lowerQuestion.includes('which') && 
            (lowerQuestion.includes('higher') || lowerQuestion.includes('highest'))) {
            const states = selectedStates.map(state => {
                const stateData = geoData.features.find(feature => 
                    feature.properties.name.toLowerCase() === state.name.toLowerCase()
                );
                return {
                    name: state.name,
                    density: stateData ? stateData.properties.ppl_density : null
                };
            }).filter(state => state.density !== null);

            if (states.length === 0) return null;

            // Sort states by density and get the highest
            const sortedStates = [...states].sort((a, b) => b.density - a.density);
            const highest = sortedStates[0];

            return `${highest.name} has the highest population density with ${highest.density.toFixed(2)} people per square mile.`;
        }

        // Handle comparison questions with "compare"
        if (lowerQuestion.includes('compare')) {
            const states = selectedStates.map(state => {
                const stateData = geoData.features.find(feature => 
                    feature.properties.name.toLowerCase() === state.name.toLowerCase()
                );
                return {
                    name: state.name,
                    density: stateData ? stateData.properties.ppl_density : null
                };
            }).filter(state => state.density !== null);

            if (states.length === 0) return null;

            // Sort states by density for comparison
            const sortedStates = [...states].sort((a, b) => b.density - a.density);
            const highest = sortedStates[0];
            const lowest = sortedStates[sortedStates.length - 1];

            // Build comparison response
            const densityDescriptions = states.map(state => 
                `${state.name} has a population density of ${state.density.toFixed(2)} people per square mile`
            ).join(', ');

            return `${densityDescriptions}. ${highest.name} has the highest population density and ${lowest.name} has the lowest population density among the selected states.`;
        }

        // Handle single state queries
        if (lowerQuestion.includes("highest population density") || 
            lowerQuestion.includes("most densely populated")) {
            const sorted = [...geoData.features].sort((a, b) => 
                b.properties.ppl_density - a.properties.ppl_density
            );
            const highest = sorted[0];
            return `${highest.properties.name} has the highest population density with ${highest.properties.ppl_density.toFixed(2)} people per square mile.`;
        }

        if (lowerQuestion.includes("lowest population density") || 
            lowerQuestion.includes("least densely populated")) {
            const sorted = [...geoData.features].sort((a, b) => 
                a.properties.ppl_density - b.properties.ppl_density
            );
            const lowest = sorted[0];
            return `${lowest.properties.name} has the lowest population density with ${lowest.properties.ppl_density.toFixed(2)} people per square mile.`;
        }

        if ((lowerQuestion.includes("average") || lowerQuestion.includes("mean")) 
            && (lowerQuestion.includes("population") || lowerQuestion.includes("density"))) {
            const sum = geoData.features.reduce((acc, feature) => 
                acc + feature.properties.ppl_density, 0
            );
            const avg = sum / geoData.features.length;
            return `The average population density across all states is ${avg.toFixed(2)} people per square mile.`;
        }

        // Handle "what's/what is the population density" questions for multiple states
        if ((lowerQuestion.startsWith("what's the population density of") || 
             lowerQuestion.startsWith("what is the population density of")) && 
            selectedStates.length > 1) {
            const states = selectedStates.map(state => {
                const stateData = geoData.features.find(feature => 
                    feature.properties.name.toLowerCase() === state.name.toLowerCase()
                );
                return {
                    name: state.name,
                    density: stateData ? stateData.properties.ppl_density : null
                };
            }).filter(state => state.density !== null);

            if (states.length === 0) return null;

            // Build simple density description for each state
            const densityDescriptions = states.map(state => 
                `${state.name} has a population density of ${state.density.toFixed(2)} people per square mile`
            ).join(', ');

            return densityDescriptions + '.';
        }

        // Handle single state queries
        if (lowerQuestion.includes("population density") || 
            lowerQuestion.includes("how dense")) {
            const stateMatch = geoData.features.find(feature => 
                selectedStates.some(state => 
                    state.name.toLowerCase() === feature.properties.name.toLowerCase()
                )
            );
            if (stateMatch) {
                return `${stateMatch.properties.name} has a population density of ${stateMatch.properties.ppl_density.toFixed(2)} people per square mile.`;
            }
        }

        return null;  // Return null for any other type of question
    };

    const handleSendMessage = async () => {
        if (!input.trim()) return;

        try {
            // First try to get local answer about population density
            const localAnswer = analyzeGeoData(input);

            if (localAnswer) {
                setResponses([
                    ...responses, 
                    { role: 'user', content: input },
                    { role: 'assistant', content: localAnswer }
                ]);
            } else {
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

                setResponses([
                    ...responses, 
                    { role: 'user', content: input }, 
                    completion.choices[0].message
                ]);
            }

            setInput('');
        } catch (error) {
            console.error('Error:', error);
            alert('Error: ' + error.message);
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
                    {selectedStates.length === 0 ? (
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
                                        <svg 
                                            xmlns="http://www.w3.org/2000/svg" 
                                            className="h-3 w-3" 
                                            viewBox="0 0 20 20" 
                                            fill="currentColor"
                                        >
                                            <path 
                                                fillRule="evenodd" 
                                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
                                                clipRule="evenodd" 
                                            />
                                        </svg>
                                    </button>
                                    {state.name}
                                </div>
                            ))}
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

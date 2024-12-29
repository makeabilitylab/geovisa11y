import React, { useState, useEffect } from 'react';
import OpenAI from 'openai';
import {
    Card,
    CardBody,
    Typography,
    Input,
    Button,
} from '@material-tailwind/react';

const Chatbot = () => {
    const [input, setInput] = useState('');
    const [responses, setResponses] = useState([]);
    const [geoData, setGeoData] = useState(null);

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

        // Only check for state if the question is about population or density
        if (lowerQuestion.includes("population") || lowerQuestion.includes("density")) {
            const stateMatch = geoData.features.find(feature => 
                lowerQuestion.includes(feature.properties.name.toLowerCase())
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

    return (
        <Card className="w-full h-full">
            <CardBody className="flex flex-col h-full">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                    MappieTalkie
                </Typography>
                <div className="flex-grow overflow-y-auto mb-2 p-2 bg-gray-50 rounded-md">
                    {responses.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}
                        >
                            <div
                                className={`py-2 px-4 rounded-md max-w-[80%] font-['Roboto'] ${
                                    msg.role === 'user'
                                        ? 'bg-teal-100 text-blue-gray-800 text-left'
                                        : 'bg-gray-200 text-gray-900 text-left'
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
                <div className="flex gap-2">
                    <Input
                        type="text"
                        label="Ask MappieTalkie"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="flex-1 font-['Roboto']"
                        labelProps={{
                            className: "!text-teal-500"
                        }}
                        color="teal"
                    />
                    <Button 
                        onClick={handleSendMessage}
                        className='bg-teal-500 text-white'
                    >
                        Send
                    </Button>
                </div>
            </CardBody>
        </Card>
    );
};

export default Chatbot;

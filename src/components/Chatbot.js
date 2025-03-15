import React, { useState, useEffect, useRef } from 'react';
import OpenAI from 'openai';
import { ArrowRight, Microphone, MicrophoneSlash, ArrowsClockwise } from "@phosphor-icons/react";
import {
    CardBody,
    Typography,
    Input,
    Button,
} from '@material-tailwind/react';
import { 
    logQuestionData, 
    logProcessingData, 
    logAnswerData, 
    generateQuestionId 
} from '../utils/logger';
import HelpPopup from './HelpPopup';
import { questionDatabase } from '../utils/questionDatabase';


const Chatbot = ({ 
    dataset, 
    focus = { type: null, states: [], county: null, city: null, highlightOnly: false },
    onFocusChange,
    onPatternQuestion, 
    apiUrl, 
    isInputFocused, 
    onInputClick, 
    isTaskPage = false,
    isTask2Page = false
}) => {
    
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [exampleQuestions, setExampleQuestions] = useState([]);
    // const [isSpeechLoading, setIsSpeechLoading] = useState(false);
    const chatContainerRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioRef = useRef(new Audio());
    // const [useSpeech, setUseSpeech] = useState(false);
    const inputRef = useRef(null);
    const wrapperRef = useRef(null);
    const [currentFocusedCity, setCurrentFocusedCity] = useState(null);
    const [stateAnnouncement, setStateAnnouncement] = useState('');
    const [lastBotMessage, setLastBotMessage] = useState('');
    const [announceCounter, setAnnounceCounter] = useState(0);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [currentQuestionSet, setCurrentQuestionSet] = useState(0);

    // List of US states
    const states = [
        'Alabama', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
        'Delaware', 'Florida', 'Georgia', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
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

    // Function to get map description based on dataset
    const getMapDescription = () => {
        if (isTaskPage) {
            switch(dataset) {
                case 'pct_tot_co':
                    return "This is a choropleth map of the United States showing the percentage of underserved population for the Digital Equity Act in each state. Darker shades indicate higher percentages.";
                case 'pct_no_bb_':
                    return "This is a choropleth map of the United States showing the percentage of population lacking access to broadband in each state. Darker shades indicate higher percentages.";
                default:
                    return "This is an interactive dot density map of the United States showing the heating fuel used in each state. One dot represents 100,000 households.";
            }
        } else {
            switch(dataset) {
                default: // ppl_densit
                    return "This is an interactive choropleth map of the United States showing population density, optimized for screen reader users.";
            }
        }
    };

    // Function to get example questions based on dataset
    const getExampleQuestions = () => {
        const [state1, state2, state3] = getRandomStates(3);
        let questions = [];
        
        // Get the appropriate question set based on dataset
        if (isTask2Page) {
            questions = questionDatabase.gas_heating;
        } else if (isTaskPage) {
            questions = dataset === 'pct_tot_co' 
                ? questionDatabase.pct_tot_co 
                : questionDatabase.pct_no_bb_;
        } else {
            questions = questionDatabase.ppl_densit;
        }

        // Get 3 questions based on current set
        const startIdx = (currentQuestionSet * 3) % questions.length;
        const selectedQuestions = questions.slice(startIdx, startIdx + 3);

        // Replace state placeholders with random states
        return selectedQuestions.map(q => 
            q.replace(/\[STATE1\]/g, state1)
             .replace(/\[STATE2\]/g, state2)
             .replace(/\[STATE3\]/g, state3)
        );
    };

    // Function to rotate question set
    const rotateQuestions = () => {
        setCurrentQuestionSet(prev => prev + 1);
        setExampleQuestions(getExampleQuestions());
    };

    // Get fresh example questions whenever dataset or currentQuestionSet changes
    useEffect(() => {
        setExampleQuestions(getExampleQuestions());
        setGeneralQuestions(getGeneralQuestions());
    }, [dataset, currentQuestionSet]);

    // Scroll to bottom of chat container when messages are updated
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    // Function to handle example question click
    const handleExampleClick = (question) => {
        //setUseSpeech(false);  // Disable speech mode
        setMessages(prev => [...prev, { text: question, sender: 'user' }]);
        handleQuestionSubmit(question, false);  // Explicitly pass false to disable speech
        audioRef.current.pause();  // Stop any ongoing speech
        audioRef.current.currentTime = 0;  // Reset audio
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                if (audioChunksRef.current.length > 0) {
                    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    //setUseSpeech(true);
                    await processAudioToText(audioBlob);
                }
            };

            // Request data every 250ms
            mediaRecorderRef.current.start(250);
            setIsRecording(true);
            
            // Add visual feedback for recording
            setMessages(prev => [...prev, { 
                text: 'Listening...', 
                sender: 'bot',
                isTemp: true 
            }]);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            setMessages(prev => [...prev, { 
                text: 'Error accessing microphone. Please check your permissions.',
                sender: 'bot'
            }]);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            
            // Remove the "Listening..." message
            setMessages(prev => prev.filter(msg => !msg.isTemp));
        }
    };

    const processAudioToText = async (audioBlob) => {
        try {
            const openai = new OpenAI({
                apiKey: process.env.REACT_APP_OPENAI_API_KEY,
                dangerouslyAllowBrowser: true
            });
            // Show processing message
            setMessages(prev => [...prev.filter(msg => !msg.isTemp), { 
                text: 'Processing your speech...', 
                sender: 'bot',
                isTemp: true 
            }]);

            const formData = new FormData();
            formData.append('file', new File([audioBlob], 'audio.webm', { type: 'audio/webm' }));

            const transcriptionResponse = await openai.audio.transcriptions.create({
                file: new File([audioBlob], 'audio.webm', { type: 'audio/webm' }),
                model: 'whisper-1',
            });

            // Remove processing message
            setMessages(prev => prev.filter(msg => !msg.isTemp));

            let transcribedText = transcriptionResponse.text;
            
            // Filter out various forms of the microphone access message
            const micAccessMessages = [
                "Page is accessing your microphone.",
                "This page is accessing your microphone.",
                "Change the setting in the address bar.",
                "Change this setting in the address bar.",
                "This page is accessing your microphone changes setting in the address bar.",
                "Page is accessing your microphone changes setting in the address bar.",
                "Listening.",
                "listening.",
                "You are currently on an application inside of Web Content. To exit this web area, press Control, Option, Shift, Up Arrow. "
            ];

            // Remove each variation of the message
            micAccessMessages.forEach(msg => {
                transcribedText = transcribedText.replace(msg, '');
            });

            // Clean up punctuation and extra spaces
            transcribedText = transcribedText
                .replace(/[.,!?]+$/, '') // Remove ending punctuation
                .replace(/\s+/g, ' ')
                .trim();

            if (transcribedText) {
                // Convert common speech patterns to standardized commands
                transcribedText = transcribedText
                    .replace(/^(?:can you |please |could you )?(?:show me |take me to |navigate to |zoom to |move to )/i, 'go to ')
                    .replace(/^(?:can you |please |could you )?(?:focus |zoom |center |concentrate )/i, 'focus on ');

                // Add the transcribed text to chat as a user message
                setMessages(prev => [...prev, { text: transcribedText, sender: 'user' }]);
                
                // Add delay before processing the question
                // Estimate reading time: ~200ms per word + 1 second base time
                const wordCount = transcribedText.split(' ').length;
                const readingDelay = Math.max(1000, wordCount * 200);
                
                // Wait for screen reader to finish
                await new Promise(resolve => setTimeout(resolve, readingDelay));
                
                // Send to API for processing with speech preserved
                handleQuestionSubmit(transcribedText, true);
            } else {
                setMessages(prev => [...prev, { 
                    text: 'I couldn\'t detect any speech. Please try again.',
                    sender: 'bot'
                }]);
            }
        } catch (error) {
            console.error('Error processing audio:', error);
            setMessages(prev => [...prev, { 
                text: 'Sorry, I had trouble understanding that. Please try again.',
                sender: 'bot'
            }]);
        }
    };

    // const speakResponse = async (text) => {
    //     try {
    //         setIsSpeechLoading(true);
    //         const openai = new OpenAI({
    //             apiKey: process.env.REACT_APP_OPENAI_API_KEY,
    //             dangerouslyAllowBrowser: true
    //         });
    //         const speechResponse = await openai.audio.speech.create({
    //             model: 'tts-1',
    //             voice: 'alloy',
    //             input: text,
    //         });

    //         const audioBlob = new Blob([await speechResponse.arrayBuffer()], { type: 'audio/mpeg' });
    //         const audioUrl = URL.createObjectURL(audioBlob);
            
    //         audioRef.current.src = audioUrl;
    //         await audioRef.current.play();
    //     } catch (error) {
    //         console.error('Error generating speech:', error);
    //     } finally {
    //         setIsSpeechLoading(false);  // Reset speech loading state
    //     }
    // };

    // Add state for tracking previous answer
    const [previousAnswer, setPreviousAnswer] = useState(null);
    const [conversationHistory, setConversationHistory] = useState([]);

    const handleQuestionSubmit = async (input, useSpeech = false) => {
        try {
            const startTime = Date.now();
            setIsLoading(true);
            
            // Add more flexible matching for "What else can you do?"
            const whatElseRegex = /^what\s+(else|more)\s+(can|could)\s+(you|i)\s+(do|ask|say).*$/i;
            if (whatElseRegex.test(input.trim()) || 
                input.toLowerCase().includes("what can you do") || 
                input.toLowerCase().includes("what else can you do")) {
                setMessages(prev => [...prev, { 
                    text: `For the current dataset, I can:<br>
                            • Compare and sort data<br>
                            • Filter information<br>
                            • Find similar values and outliers<br>
                            • Describe patterns on the map<br>
                            • Describe state shapes<br>
                            • Identify neighboring states`, 
                    sender: 'bot' 
                }]);
                setIsLoading(false);
                return;
            }

            // Create focus object that includes state, county, and showingCounties flag
            const currentFocus = !focus ? { type: null, full: 'No focus' } :
                focus.type === 'city' && focus.city
                    ? {
                        type: 'city',
                        city: focus.city.name,
                        state: focus.city.state,
                        coordinates: focus.city.coordinates,
                        full: `${focus.city.name}, ${focus.city.state}`
                      }
                    : focus.type === 'county' && focus.county
                    ? {
                        type: 'county',
                        county: focus.county,
                        state: focus.states?.[0] || '',
                        full: `${focus.county} County, ${focus.states?.[0] || ''}`
                      }
                    : focus.type === 'state' || focus.type === 'compare'
                    ? {
                        type: focus.type,
                        states: focus.states || [],
                        full: focus.states?.length > 1 
                          ? focus.states.join(', ') 
                          : focus.states?.[0] || ''
                      }
                    : {
                        type: null,
                        full: 'No focus'
                      };

            // Log the current focus for debugging
            console.log("Sending current focus to backend:", currentFocus);

            // Build conversation history from messages
            const messageHistory = messages.map(msg => msg.text);
            
            // Get map viewport information (you'll need to pass this from the Map component)
            const mapViewport = {
                zoom: window.mapZoomLevel || null,
                center: window.mapCenter || null,
                bounds: window.mapBounds || null
            };

            // Log the question data and get a question ID
            const questionId = await logQuestionData(
                input, 
                previousAnswer, 
                focus.type,
                focus.states,
                focus.county,
                focus.city,
                messageHistory,
                dataset,
                mapViewport
            );

            // console.log('Sending input to analyze:', {
            //     input,
            //     previous_answer: previousAnswer,
            //     current_focus: currentFocus,
            //     raw_state: currentFocusedState,
            //     raw_county: currentFocusedCounty,
            //     conversation_history: messageHistory,
            //     question_id: questionId
            // });
            
            // console.log('Conversation history:', messageHistory);

            // Prepare the request data
            const requestData = {
                input: input,
                current_dataset: dataset,
                current_focus: focus || { type: null, states: [], county: null, city: null, highlightOnly: false }, 
                previous_answer: previousAnswer,
                conversation_history: messageHistory,
                question_id: questionId,
                raw_county: focus?.county || null,
                raw_state: focus?.states?.[0] || null
            };

            const response = await fetch(`${apiUrl}/api/analyze-input`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': window.location.origin
                },
                credentials: 'include',
                mode: 'cors',
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const processingTime = Date.now() - startTime;
            
            console.log('Response:', {
                "dataset": dataset,
                "question_type": data.question_type,
                "result": data.result,
                "processing_time_ms": processingTime
            });
            
            // Log the answer data
            await logAnswerData(
                questionId, 
                data.result, 
                processingTime, 
                dataset, 
                data.question_type
            );

            // Handle action responses
            if (data.is_action) {
                if (data.action_type === 'focus_city') {
                    // Handle city focus
                    setMessages(prev => [...prev, { 
                        text: `Focusing on ${data.city_name}, ${data.state}.`, 
                        sender: 'bot' 
                    }]);
                    onFocusChange({
                        type: 'city',
                        city: {
                            name: data.city_name,
                            state: data.state,
                            coordinates: data.coordinates
                        },
                        highlightOnly: false
                    });
                    return;
                } else if (data.action_type === 'focus_county') {
                    // Handle county focus
                    onFocusChange({
                        type: 'county',
                        county: data.county_name,
                        states: [data.state],
                        highlightOnly: false
                    });
                    setMessages(prev => [...prev, { 
                        text: `Focusing on ${data.county_name}, ${data.state}.`, 
                        sender: 'bot' 
                    }]);
                    return;
                } else if (data.action_type === 'focus' && data.state) {
                    onFocusChange({
                        type: 'state',
                        states: [data.state],
                        county: null,
                        city: null,
                        highlightOnly: false
                    });
                    setMessages(prev => [...prev, { 
                        text: `Focusing on ${data.state}.`, 
                        sender: 'bot' 
                    }]);
                    return;
                }
            }

            // Handle question responses
            if (data.result) {
                setPreviousAnswer(data.result); // Store the answer for context
                setConversationHistory(prev => [...prev, input, data.result]); // Update conversation history
                setLastBotMessage(data.result); // Add this line to track last bot message
                if (data.question_type === 'get_pattern') {
                    onPatternQuestion(true);
                } else {
                    // Turn off spatial clusters for non-pattern questions
                    onPatternQuestion(false);
                }

                // Handle state/county focusing for relevant question types
                if (data.question_type === 'retrieve') {
                    if (data.county) {
                        console.log("Setting county focus:", data.county, data.state);
                        onFocusChange({
                            type: 'county',
                            county: data.county,
                            states: [data.state], // Use states array instead of state
                            highlightOnly: false
                        });
                    } else if (data.state) {
                        onFocusChange({
                            type: 'state',
                            states: [data.state],
                            county: null,
                            city: null,
                            highlightOnly: false
                        });
                    }
                } else if (data.states && data.question_type === 'compare') {
                    onFocusChange({
                        type: 'state',
                        states: data.states,
                        county: null,
                        city: null,
                        highlightOnly: true
                    });
                } else if (data.question_type === 'find_extremum') {
                    if (data.county) {
                        // If we have county data, focus on the county
                        onFocusChange({
                            type: 'county',
                            county: data.county,
                            states: [data.state], // Use states array instead of state
                            highlightOnly: false
                        });
                    } else {
                        // Otherwise just focus on the state
                        onFocusChange({
                            type: 'state',
                            states: [data.state],
                            county: null,
                            city: null,
                            highlightOnly: false
                        });
                    }
                }

                setMessages(prev => [...prev, { text: data.result, sender: 'bot' }]);
            }

        } catch (error) {
            console.error('Error:', error);
            setMessages(prev => [...prev, { 
                text: 'Sorry, I encountered an error. Please try again.',
                sender: 'bot'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input;
        setInput('');
        //setUseSpeech(false);  // Disable speech mode
        setMessages(prev => [...prev, { text: userMessage, sender: 'user' }]);
        handleQuestionSubmit(userMessage, false); 
    };

    // Modify handleKeyDown for text input to ignore spacebar
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSubmit(e);
        }
        // Prevent spacebar from triggering in the input field
        if (e.code === 'Space') {
            e.stopPropagation();
        }
    };

    // Add spacebar handler for recording as a separate effect
    useEffect(() => {
        const handleSpacebarRecord = (e) => {
            if (e.code === 'Space' && !isRecording && !e.repeat && !isInputFocused) {
                e.preventDefault();
                startRecording();
            }
        };

        const handleSpacebarStop = (e) => {
            if (e.code === 'Space' && isRecording && !isInputFocused) {
                e.preventDefault();
                stopRecording();
            }
        };

        window.addEventListener('keydown', handleSpacebarRecord);
        window.addEventListener('keyup', handleSpacebarStop);

        return () => {
            window.removeEventListener('keydown', handleSpacebarRecord);
            window.removeEventListener('keyup', handleSpacebarStop);
        };
    }, [isRecording, isInputFocused]);


    // Function to get general knowledge questions based on dataset
    const getGeneralQuestions = () => {
        switch(dataset) {
            case 'pct_tot_co':
                return [
                    "What's a choropleth map?",
                    "Is there a relationship between income and the percentage of underserved population?"
                ];
            case 'pct_no_bb_':
                return [
                    "What's a choropleth map?",
                    "Is there a relationship between population density and the percentage of people lacking broadband or computer access?"
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

    useEffect(() => {
        // Cleanup function to stop audio when component unmounts or dataset changes
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };
    }, [dataset]);

    useEffect(() => {
        console.log('OpenAI API Key:', process.env.REACT_APP_OPENAI_API_KEY ? 'Set' : 'Not Set');
        console.log('Mapbox Token:', process.env.REACT_APP_MAPBOX_TOKEN ? 'Set' : 'Not Set');
    }, []);

    // Add new useEffect for microphone permission
    useEffect(() => {
        const requestMicrophonePermission = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        // Stop the stream right away - we just wanted the permission
                        stream.getTracks().forEach(track => track.stop());
                    });
            } catch (error) {
                console.log('Microphone permission was denied or error occurred:', error);
            }
        };

        requestMicrophonePermission();
    }, []); // Empty dependency array means this runs once on mount

    // Add useEffect to monitor focused state changes
    useEffect(() => {
        console.log('Focus state updated:', focus.type, focus.states, focus.county, focus.city);
    }, [focus]);

    useEffect(() => {
        // Focus the welcome section on component mount
        const welcomeSection = document.getElementById('welcome');
        if (welcomeSection) {
            welcomeSection.focus();
        }
    }, []);

    // Update input ref focus when isInputFocused changes
    useEffect(() => {
        if (isInputFocused && wrapperRef.current) {
            const input = wrapperRef.current.querySelector('input');
            if (input) {
                input.focus();
            }
        }
    }, [isInputFocused]);

    // Add ref for the welcome section
    const welcomeRef = useRef(null);
    
    // Add effect for Ctrl+H hotkey to show help popup
    useEffect(() => {
        const handleHelpHotkey = (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                setIsHelpOpen(!isHelpOpen);
            }
        };
        
        window.addEventListener('keydown', handleHelpHotkey);
        return () => window.removeEventListener('keydown', handleHelpHotkey);
    }, [isHelpOpen]);

    // Add null checks when accessing focus properties
    const handleFocusChange = (newFocus = { type: null, states: [], county: null, city: null, highlightOnly: false }) => {
        // Ensure newFocus has all required properties
        const safeFocus = {
            type: newFocus?.type || null,
            states: newFocus?.states || [],
            county: newFocus?.county || null,
            city: newFocus?.city || null,
            highlightOnly: newFocus?.highlightOnly || false
        };
        
        // Update focus state with safe values
        onFocusChange(safeFocus);
    };

    // When checking focus type, add null checks
    const checkFocusType = (focus) => {
        if (!focus) return false;
        return focus.type === 'state' || focus.type === 'county';
    };

    // Example usage in your component
    useEffect(() => {
        if (!focus) {
            // Initialize with default values if focus is undefined
            handleFocusChange();
            return;
        }

        try {
            // Your existing focus-dependent code here
            if (focus?.type === 'state') {
                // Handle state focus
            } else if (focus?.type === 'county') {
                // Handle county focus
            }
        } catch (error) {
            console.error('Error handling focus:', error);
            // Reset to default state if there's an error
            handleFocusChange();
        }
    }, [focus]);

    // Add effect for Ctrl+L hotkey to announce last message
    useEffect(() => {
        const handleLastMessageHotkey = (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                if (lastBotMessage) {
                    // Increment counter to make each announcement unique
                    setAnnounceCounter(prev => prev + 1);
                    setStateAnnouncement(`Previous response ${announceCounter}: ${lastBotMessage}`);
                } else {
                    setStateAnnouncement('No previous chat messages to announce.');
                }
            }
        };
        
        window.addEventListener('keydown', handleLastMessageHotkey);
        return () => window.removeEventListener('keydown', handleLastMessageHotkey);
    }, [lastBotMessage, announceCounter]);

    // Add effect for Ctrl+I hotkey to refresh questions
    useEffect(() => {
        const handleRefreshHotkey = (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'i') {
                e.preventDefault(); // Prevent the default find action
                rotateQuestions();
            }
        };
        
        window.addEventListener('keydown', handleRefreshHotkey);
        return () => window.removeEventListener('keydown', handleRefreshHotkey);
    }, []);

    return (
        <CardBody 
            className="flex flex-col h-full p-2 overflow-y-auto max-h-screen min-w-[300px]"
            role="region"
            aria-label="MappieTalkie chat interface"
            style={{ maxHeight: '100vh' }}
        >
            <div 
                id="welcome"  
                ref={welcomeRef}
                aria-live="polite" 
                role="region"
                tabIndex="0"
                aria-label="Welcome to MappieTalkie"
                className="mb-4"
            > 
                <Typography variant="h6" color="blue-gray" className="mb-2">
                    Welcome to MappieTalkie
                </Typography>

                <Typography variant="small" color="gray" className="mb-2 text-xs">
                    <span>{getMapDescription()}</span>
                    <span>{'You can ask me questions about the map visualization:'}</span>
                </Typography>

                <div className="mb-4">
                    <div className="flex flex-wrap gap-2 mb-2">
                        {exampleQuestions.map((question, index) => (
                            <span
                                key={index}
                                onClick={() => handleExampleClick(question)}
                                className="px-3 py-1 bg-light-green-50 hover:bg-light-green-100 rounded-full text-xs text-green-900 transition-colors text-left cursor-pointer"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick(question);
                                    }
                                }}
                            >
                                {question}
                            </span>
                        ))}
                    </div>
                    <div className="flex justify-start">
                        <span
                            onClick={rotateQuestions}
                            className="px-3 py-1 bg-blue-gray-50 hover:bg-blue-gray-100 rounded-full text-xs text-blue-gray-900 transition-colors cursor-pointer flex items-center gap-1 w-fit"
                            role="button"
                            tabIndex="0"
                            onKeyPress={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    rotateQuestions();
                                }
                            }}
                            aria-label="Refresh question suggestions (Ctrl+I)"
                        >
                            <ArrowsClockwise size={12} />
                            <span>More suggestions</span>
                            <kbd className="ml-1 px-1 py-0.5 border border-blue-gray-900 text-blue-gray-900 rounded text-[10px]">Ctrl+I</kbd>
                        </span>
                    </div>
                </div>

                <Typography variant="small" color="gray" className="mb-4 text-xs">
                    Or you can ask me questions outside of the dataset:
                    <div className="flex flex-wrap gap-2 mt-2">
                        {generalQuestions.map((question, index) => (
                            <span
                                key={index}
                                onClick={() => handleExampleClick(question)}
                                className="px-3 py-1 bg-purple-50 hover:bg-purple-100 rounded-full text-xs text-purple-900 transition-colors text-left cursor-pointer font-normal"
                                role="text"
                                tabIndex="0"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        handleExampleClick(question);
                                    }
                                }}
                            >
                                {question}
                            </span>
                        ))}
                    </div>
                </Typography>

                <Typography variant="small" color="gray" className="text-xs">
                    {"Ask "}
                        <span
                        onClick={() => handleExampleClick("What else can you do?")}
                        className="mb-2 px-3 py-1 bg-blue-50 hover:bg-blue-100 rounded-full text-xs text-blue-900 transition-colors text-left cursor-pointer inline-block font-normal"
                        role="text"
                        tabIndex="0"
                        onKeyPress={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                        handleExampleClick("What else can you do?");
                                }
                        }}
                        >
                        What else can you do?
                    </span>
                    {" to hear a list of all available features."}
                    <br />
                    {"Press "}
                    <kbd className="ml-1 px-1 py-0.5 border border-blue-900 text-blue-900 rounded">Ctrl+H</kbd>
                    {" to see all keyboard shortcuts and navigation commands."}
                </Typography>
            </div>

            {/* Help Popup */}
            <HelpPopup 
                open={isHelpOpen}
                handleOpen={() => setIsHelpOpen(!isHelpOpen)}
                dataset={dataset}
            />

            <div 
                ref={chatContainerRef}
                className="flex-grow overflow-y-auto mb-2 p-2 bg-gray-50 rounded-md"
                role="log"
                aria-label="Chat messages"
                aria-live="polite"
                style={{ minHeight: '400px' }}
            >
                <div role="log">
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} mb-2`}
                            role={msg.sender === 'user' ? 'note' : 'article'}
                            aria-label={`${msg.sender === 'user' ? 'You' : 'MappieTalkie'} said`}
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
                                    dangerouslySetInnerHTML={{ __html: msg.text || ' ' }}
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
            </div>

            {/* Live region for announcements */}
            <div
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                className="sr-only"
            >
                {stateAnnouncement || ' '}
            </div>

            {/* Input, Microphone, and Send Button */}
            <div 
                className="flex gap-2 items-center"
                role="form"
                aria-label="Message input"
            >
                <div className="flex-grow">
                    <div ref={wrapperRef}>
                            <Input
                                type="text"
                                label="Ask MappieTalkie"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onClick={() => {
                                    // Only change focus if it's not already on chat
                                    if (!isInputFocused) {
                                        onInputClick();
                                    }
                                }}
                                onFocus={() => {
                                    // console.log('Input focused');
                                }}
                                onBlur={() => {
                                    // console.log('Input blurred');
                                }}
                                className={`font-['Roboto'] ${!isInputFocused ? 'opacity-50' : ''}`}
                                labelProps={{
                                    className: "!text-teal-500"
                                }}
                                color="teal"
                                aria-label="Type your question here"
                                aria-description="Press Enter to submit your question"
                                containerProps={{ ref: inputRef }}
                            />
                    </div>
                </div>
                <Button 
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`${
                        isRecording ? 'bg-red-500' : 'bg-teal-500'
                    } text-white p-2.5 aspect-square`}
                    size="sm"
                    aria-label={isRecording ? "Stop recording voice input" : "Start recording voice input"}
                    aria-pressed={isRecording}
                >
                    {isRecording ? 
                        <MicrophoneSlash size={20} weight="bold" /> : 
                        <Microphone size={20} weight="bold" />
                    }
                </Button>
                <Button 
                    onClick={handleSubmit}
                    className={`bg-teal-500 text-white p-2.5 aspect-square ${!isInputFocused ? 'opacity-50 cursor-not-allowed' : ''}`}
                    size="sm"
                    aria-label="Send question"
                    disabled={!input.trim() || !isInputFocused}
                >
                    <ArrowRight size={20} weight="bold" />
                </Button>
            </div>
        </CardBody>
    );
};

export default Chatbot;
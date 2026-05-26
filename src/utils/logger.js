import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Get or create session ID from localStorage
const getSessionId = () => {
  let sessionId = localStorage.getItem('mappie_session_id');
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem('mappie_session_id', sessionId);
    // Also store session start time
    localStorage.setItem('mappie_session_start', new Date().toISOString());
  }
  return sessionId;
};

// Generate a unique question ID
const generateQuestionId = () => {
  return uuidv4();
};

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/logs`;

const logToMongoDB = async (logData) => {
  try {
    // Add session information
    logData.session_id = getSessionId();
    logData.session_start = localStorage.getItem('mappie_session_start');
    logData.timestamp = new Date().toISOString();
    logData.screen_resolution = `${window.screen.width}x${window.screen.height}`;
    logData.user_agent = navigator.userAgent;

    const response = await axios.post(API_URL, logData, {
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      }
    });

    return response.data;
  } catch (error) {
    //console.error('Error sending log to MongoDB:', error);
    console.error("Error sending log to MongoDB: ", {
      message: error.message,
      endpoint: API_URL,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    return false;
  }
};

// Log when a question is asked
const logQuestionData = async (
  question,                 // input from Chatbot.js
  previousAnswer,           // previousAnswer from Chatbot.js
  focusType,                // focus.type from Chatbot.js
  focusStates,              // focus.states from Chatbot.js
  focusCounty,              // focus.county from Chatbot.js
  focusCity,                // focus.city from Chatbot.js
  conversationHistory,      // messageHistory from Chatbot.js
  dataset,                  // dataset from Chatbot.js
  mapViewport               // mapViewport from Chatbot.js
) => {
  const questionId = generateQuestionId();

  const logData = {
    log_type: 'question',
    question_id: questionId,
    question_text: question,
    previous_answer: previousAnswer,
    current_focus: focusType,
    focus_states: focusStates,
    raw_county: focusCounty,
    focus_city: focusCity,
    conversation_history: conversationHistory,
    current_dataset: dataset,
    map_viewport: mapViewport
  };

  const result = await logToMongoDB(logData);
  return questionId;
};

// Log processing information
const logProcessingData = async (questionId, processingData) => {
  const logData = {
    log_type: 'processing',
    question_id: questionId,
    ...processingData
  };

  return await logToMongoDB(logData);
};

// Log the final answer
const logAnswerData = async (questionId, result, processingTime, dataset, questionType) => {
  const logData = {
    log_type: 'answer',
    question_id: questionId,
    answer_id: uuidv4(),
    result: result,
    processing_time_ms: processingTime,
    dataset: dataset,
    question_type: questionType
  };

  return await logToMongoDB(logData);
};

// Log map interactions
const logMapInteraction = async (interactionType, viewport, focusedState, focusedCounty, focusMethod) => {
  const logData = {
    log_type: 'map_interaction',
    interaction_type: interactionType, // 'zoom', 'pan', 'focus'
    viewport: viewport,
    focused_state: focusedState,
    focused_county: focusedCounty,
    focus_method: focusMethod // 'map' or 'chatbot'
  };

  return await logToMongoDB(logData);
};

// Log session end
const logSessionEnd = async () => {
  const sessionId = getSessionId();
  const sessionStart = localStorage.getItem('mappie_session_start');

  const logData = {
    log_type: 'session_end',
    session_id: sessionId,
    session_start: sessionStart,
    session_duration_ms: new Date() - new Date(sessionStart)
  };

  return await logToMongoDB(logData);
};

export {
  logQuestionData,
  logProcessingData,
  logAnswerData,
  logMapInteraction,
  logSessionEnd,
  generateQuestionId
};
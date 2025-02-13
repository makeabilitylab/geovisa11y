import { useRef } from "react";

/*
  React hook that acts like a class and encapsulates all the obtaining of microphone data via an API and converting that into Speech then to Text. That logic is in the this file.
 */

const useSpeechRecognition = ({ resetTranscriptText,
                                stopRecordingHandler }) => {
  // Use ref to store the recognition instance across renders
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null); // To store the silence timer
  const silenceThreshold = 1500;  // 3 seconds of silence

  // Handle the logic to start recording
  const startRecording = () => {
    // Created the Speech Recongition API
    const SpeechRecognitionAPI = window.SpeechRecognition ||
                                 window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    // Saving the instance into a ref
    recognitionRef.current = recognition;

    // Set continuous mode and interim results to get real-time results

    // Continually enables the mic
    recognition.continuous = true;

    // Gets multiple results, and in-progress transcription
    recognition.interimResults = true;

    // Once the recognition finishes the transcript is updated into the input
    // bar of the chatbot.
    recognition.onresult = (event) => {
      handleRecognitionResult(event, resetTranscriptText);
      resetSilenceTimer(); // Reset silence timer when speech is detected
    };

    recognition.onend = () => {
      // This is triggered when speech recognition stops, either manually or
      // automatically. Set the parent isRecording state variable to false.
      // This as a byproduct switches the text of the button back to record
      // again.
      stopRecordingHandler(false);
    };

    // Start the recording
    recognition.start();
  };

  // Stop the recording
  const stopRecording = () => {
    if (recognitionRef.current) {
      // Stopping the Web Speech API speech recongition object from gathering
      // microphone data.
      recognitionRef.current.stop();
    }
  };

  /**
   * This async function performs the transcript update via the given
   * state handler. This then triggers a useEffect dependency call on the
   * state variable back in the parent as the transcript state value has now
   * been updated. Primarily leads to sync up the useEffect code to be
   * executed which copies the contents from the transcript into the input
   * form of the mappie talkie chatbot via the setInput handler function for
   * the input state variable contained in the parent. Assign the named async
   * function to the onresult handler.
   * @param {Event} event - SpeechRecongnition event
   * @param {Function} resetTranscriptText - Set state function for the
   *                transcript state variable from the parent component.
   */
  async function handleRecognitionResult(event, resetTranscriptText) {
    const newTranscript = event.results[0][0].transcript;
    console.log(event);

    // Using transcript state variable handler from parent, passed down as
    // a prop to update the state of the transcript.
    resetTranscriptText(newTranscript);

    console.log("Updated transcript: " + newTranscript)

    // Reset silence timer after new speech
    resetSilenceTimer();
  }

  // Start the silence timer
  const resetSilenceTimer = () => {
    // Clear the existing timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    // Set a new timer to stop recording after 1 and half seconds of silence
    silenceTimerRef.current = setTimeout(() => {
      console.log("Silence detected for 1.5 seconds, stopping recording...");
      stopRecording();
    }, silenceThreshold);
  };

  // Return the functions as part of the object to be used as "instance methods"
  return {startRecording, stopRecording};
};

export default useSpeechRecognition;

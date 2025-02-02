import { useRef } from "react";

const useSpeechRecognition = ({ resetTranscriptText,
                                stopRecordingHandler }) => {
  // Use ref to store the recognition instance across renders
  const recognitionRef = useRef(null);

  // Handle the logic to start recording
  const startRecording = () => {
    // Created the Speech Recongition API
    const SpeechRecognitionAPI = window.SpeechRecognition ||
                                 window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    // Saving the instance into a ref
    recognitionRef.current = recognition;

    // Once the recognition finishes the transcript is updated into the input
    // bar of the chatbot.
    recognition.onresult = (event) => {
      handleRecognitionResult(event, resetTranscriptText);
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
    resetTranscriptText((prevTranscript) => {
      console.log("Prev transcript: " + prevTranscript);
      console.log("New transcript: " + newTranscript);
      const combinedTranscript = prevTranscript + " " + newTranscript;

      // Set transcript state variable as the combined transcript
      return combinedTranscript;
    });

    // Set the parent isRecording state variable to false. This as a
    // byproduct switches the text of the button back to record again.
    stopRecordingHandler(false);
  }

  // Return the functions as part of the object to be used as "instance methods"
  return {startRecording, stopRecording};
};

export default useSpeechRecognition;

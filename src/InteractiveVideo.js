import React, { useState, useRef, useEffect } from 'react';
import { Button, Box, Container, Typography } from '@mui/material';
import axios from 'axios';
import RecordRTC from 'recordrtc';

const InteractiveVideo = () => {
    const API_URL = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/$/, '') : 'http://localhost:5000';
    const videoRef = useRef(null);
    const recorderRef = useRef(null);
    const [isPaused, setIsPaused] = useState(false);
    const [feedbackAudio, setFeedbackAudio] = useState('');
    const [currentVideoId, setCurrentVideoId] = useState(1);
    const [voiceChatMode, setVoiceChatMode] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [voiceChatResponse, setVoiceChatResponse] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        console.log('API_URL:', API_URL);
    }, []);

    useEffect(() => {
        console.log('Voice chat mode:', voiceChatMode);
    }, [voiceChatMode]);

    const startRecording = () => {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            recorderRef.current = new RecordRTC(stream, {
                type: 'audio',
                mimeType: 'audio/wav',
                recorderType: RecordRTC.StereoAudioRecorder,
            });
            recorderRef.current.startRecording();
        }).catch(error => {
            console.error('Error accessing media devices.', error);
        });
    };

    const stopRecording = () => {
        if (recorderRef.current) {
            recorderRef.current.stopRecording(() => {
                const blob = recorderRef.current.getBlob();
                handleDataAvailable(blob);
            });
        }
    };

    const handleDataAvailable = async (blob) => {
        const formData = new FormData();
        const file = new File([blob], 'speech.wav', { type: 'audio/wav' });
        formData.append('file', file);
        formData.append('currentVideoId', currentVideoId);

        console.log('FormData being sent:', formData.get('file'));

        try {
            console.log('sending response to backend');
            const response = await axios.post(`${API_URL}/api/process-speech`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const { nextVideo, feedbackAudio } = response.data;
            setFeedbackAudio(feedbackAudio);

            if (nextVideo) {
                console.log('Next video URL:', `${API_URL}${nextVideo.url}`);
                videoRef.current.src = `${API_URL}${nextVideo.url}`;

                videoRef.current.addEventListener('loadeddata', () => {
                    videoRef.current.play();
                    setIsPaused(false);
                    setCurrentVideoId(nextVideo.id);
                }, { once: true });
            } else if (feedbackAudio) {
                console.log('Playing feedback audio:', feedbackAudio);
                const audio = new Audio(feedbackAudio);
                audio.play();
            }
        } catch (error) {
            console.error('Error processing speech:', error.response?.data || error.message);
        }
    };

    useEffect(() => {
        const loadInitialVideo = async () => {
            try {
                const response = await axios.get(`${API_URL}/api/current-video`, {
                    params: { videoId: currentVideoId },
                });
                console.log('videos.js response', response);
                const initialVideo = response.data;
                console.log(`the video url is: ${API_URL}${initialVideo.url}`);
                videoRef.current.src = `${API_URL}${initialVideo.url}`;
            } catch (error) {
                console.error('Error loading initial video:', error.response?.data || error.message);
            }
        };

        loadInitialVideo();

        const videoElement = videoRef.current;
        const pauseTime = 2;

        const handleTimeUpdate = () => {
            if (videoElement.currentTime >= pauseTime && videoElement.currentTime <= pauseTime + 0.2) {
                videoElement.pause();
                setIsPaused(true);
                startRecording();
            }
        };

        videoElement.addEventListener('timeupdate', handleTimeUpdate);

        return () => {
            videoElement.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, [currentVideoId]);

    const startListening = () => {
        if ('webkitSpeechRecognition' in window && !isPlaying) {
            const SpeechRecognition = window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript + ' ';
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    setTranscript((prev) => prev + finalTranscript);
                }

                console.log('Interim transcript:', interimTranscript);
            };

            recognition.onend = () => {
                console.log('Speech recognition ended');
                if (isListening) {
                    recognition.start();
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error', event.error);
            };

            recognition.start();
            setIsListening(true);
        } else {
            console.error('Web Speech API is not supported in this browser or audio is playing');
        }
    };

    const stopListening = () => {
        setIsListening(false);
    };

    useEffect(() => {
        let timer;
        if (transcript) {
            timer = setTimeout(() => {
                handleVoiceChatSubmit(transcript);
                setTranscript('');
            }, 3000);  // Wait for 3 seconds after last speech
        }

        return () => {
            if (timer) {
                clearTimeout(timer);
            }
        };
    }, [transcript]);

    const handleVoiceChatSubmit = async (input) => {
        console.log('Submitting voice chat input:', input);
        try {
            setIsPlaying(true);
            const response = await axios.post(`${API_URL}/api/voice-chat`, {
                transcript: input
            });
            console.log('Received voice chat response:', response.data);
            setVoiceChatResponse(response.data.text);
            const audio = new Audio(`data:audio/mp3;base64,${response.data.audio}`);
            audio.onended = () => {
                setIsPlaying(false);
            };
            audio.play();
        } catch (error) {
            console.error('Error in voice chat:', error.response?.data || error.message);
            setIsPlaying(false);
        }
    };

    return (
        <Container>
            <Box>
                <video ref={videoRef} key={currentVideoId} controls />
            </Box>
            {isPaused && (
                <Box mt={2}>
                    <Button variant="contained" color="primary" onClick={stopRecording}>
                        Stop Recording
                    </Button>
                </Box>
            )}
            {feedbackAudio && (
                <audio controls src={feedbackAudio}>
                    Your browser does not support the audio element.
                </audio>
            )}
            <Box mt={2}>
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => {
                        setVoiceChatMode(!voiceChatMode);
                        if (!voiceChatMode) {
                            startListening();
                        } else {
                            stopListening();
                        }
                    }}
                >
                    {voiceChatMode ? 'Exit Voice Chat' : 'Enter Voice Chat'}
                </Button>
            </Box>
            {voiceChatMode && (
                <Box mt={2}>
                    <Typography variant="h6">
                        {isListening ? 'Listening...' : isPlaying ? 'Playing...' : 'Not listening'}
                    </Typography>
                    <Typography variant="body1">
                        Transcript: {transcript}
                    </Typography>
                    {voiceChatResponse && (
                        <Box mt={2}>
                            <Typography variant="h6">Response:</Typography>
                            <Typography variant="body1">{voiceChatResponse}</Typography>
                        </Box>
                    )}
                </Box>
            )}
        </Container>
    );
};

export default InteractiveVideo;

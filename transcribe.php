<?php
// Your OpenAI API Key
$api_key = 'PUT_YOUR_API_KEY_HERE';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['audio'])) {
    $audio_file = $_FILES['audio']['tmp_name'];

    $ch = curl_init();

    curl_setopt($ch, CURLOPT_URL, 'https://api.openai.com/v1/audio/transcriptions');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $api_key,
    ]);

    $postfields = [
        'file' => new CURLFile($audio_file, 'audio/wav', 'audio.wav'),
        'model' => 'whisper-1',
    ];

    curl_setopt($ch, CURLOPT_POSTFIELDS, $postfields);

    $response = curl_exec($ch);

    if (curl_errno($ch)) {
        echo 'Error: ' . curl_error($ch);
    } else {
        $result = json_decode($response, true);
        if (isset($result['text'])) {
            echo $result['text'];
        } else {
            echo 'Error: Unable to transcribe audio';
        }
    }

    curl_close($ch);
} else {
    echo 'Error: No audio file received';
}
?>
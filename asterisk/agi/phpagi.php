<?php
/**
 * phpagi.php — Minimal AGI Library for Asterisk
 * Self-contained, no external dependencies
 */

class AGI {
    public $in  = null;
    public $out = null;

    public function __construct() {
        $this->in  = fopen('php://stdin',  'r');
        $this->out = fopen('php://stdout', 'w');
        // Read initial AGI environment variables
        while (true) {
            $line = fgets($this->in);
            if ($line === false || trim($line) === '') break;
        }
    }

    /** Send command to Asterisk and get response */
    private function send($cmd) {
        fwrite($this->out, $cmd . "\n");
        fflush($this->out);
        $response = fgets($this->in);
        return $this->parse_response($response);
    }

    private function parse_response($response) {
        $response = trim($response);
        $result = ['code' => 0, 'result' => -1, 'data' => ''];
        if (preg_match('/^(\d+)\s+result=(-?\d+)\s*(.*)$/', $response, $m)) {
            $result['code']   = (int)$m[1];
            $result['result'] = (int)$m[2];
            $result['data']   = isset($m[3]) ? trim($m[3], '()') : '';
        }
        return $result;
    }

    /** Set a channel variable */
    public function set_variable($name, $value) {
        return $this->send("SET VARIABLE \"$name\" \"$value\"");
    }

    /** Get a channel variable */
    public function get_variable($name) {
        return $this->send("GET VARIABLE \"$name\"");
    }

    /** Get full variable (supports expressions) */
    public function get_full_variable($name) {
        return $this->send("GET FULL VARIABLE \"$name\"");
    }

    /** Log a verbose message to Asterisk */
    public function verbose($msg, $level = 1) {
        return $this->send("VERBOSE \"" . addslashes($msg) . "\" $level");
    }

    /** Play a sound file */
    public function stream_file($file, $escape_digits = '') {
        return $this->send("STREAM FILE $file \"$escape_digits\"");
    }

    /** Answer the channel */
    public function answer() {
        return $this->send("ANSWER");
    }

    /** Hangup the channel */
    public function hangup($channel = '') {
        return $this->send("HANGUP $channel");
    }

    /** Get caller ID */
    public function get_callerid() {
        $r = $this->get_variable('CALLERID(num)');
        return $r['data'];
    }

    /** Exec an Asterisk application */
    public function exec($app, $data = '') {
        return $this->send("EXEC $app \"$data\"");
    }

    /** Send DTMF */
    public function send_dtmf($digits) {
        return $this->send("SEND DTMF $digits");
    }

    /** Wait for digit */
    public function wait_for_digit($timeout = -1) {
        return $this->send("WAIT FOR DIGIT $timeout");
    }

    /** Record file */
    public function record_file($file, $format, $escape_digits = '#', $timeout = -1) {
        return $this->send("RECORD FILE $file $format \"$escape_digits\" $timeout");
    }

    /** Database get */
    public function database_get($family, $key) {
        return $this->send("DATABASE GET $family $key");
    }

    /** Database put */
    public function database_put($family, $key, $value) {
        return $this->send("DATABASE PUT $family $key $value");
    }
}

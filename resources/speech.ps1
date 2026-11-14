param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
try {
    Add-Type -ReferencedAssemblies System.Speech,System.Web.Extensions -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Speech.Recognition;
using System.Web.Script.Serialization;
public static class LocalDictation {
    static readonly object Gate = new object();
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static void Emit(object value) {
        lock (Gate) { Console.WriteLine(Json.Serialize(value)); Console.Out.Flush(); }
    }
    public static void Run() {
        using (var engine = new SpeechRecognitionEngine()) {
            engine.LoadGrammar(new DictationGrammar());
            engine.SetInputToDefaultAudioDevice();
            var clock = Stopwatch.StartNew();
            engine.AudioLevelUpdated += (s, e) => {
                if (clock.ElapsedMilliseconds < 80) return;
                clock.Restart();
                Emit(new { type = "level", level = e.AudioLevel / 100.0 });
            };
            engine.SpeechRecognized += (s, e) => {
                if (!String.IsNullOrWhiteSpace(e.Result.Text))
                    Emit(new { type = "transcript", text = e.Result.Text });
            };
            engine.SpeechRecognitionRejected += (s, e) => Emit(new { type = "hint", text = "Didn't catch that. Try speaking again." });
            engine.RecognizeCompleted += (s, e) => {
                if (e.Error != null) Emit(new { type = "error", text = "Speech recognition stopped. Check your microphone and try again." });
            };
            engine.RecognizeAsync(RecognizeMode.Multiple);
            Emit(new { type = "listening" });
            Console.ReadLine();
            engine.RecognizeAsyncCancel();
        }
    }
}
'@
    if (-not $ValidateOnly) { [LocalDictation]::Run() }
} catch {
    [Console]::WriteLine('{"type":"error","text":"Cannot start Windows dictation. Check microphone privacy permissions, the default input device, and installed Windows speech language packs."}')
    exit 1
}

package br.com.a3locacao.a3manager;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(A3AndroidPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

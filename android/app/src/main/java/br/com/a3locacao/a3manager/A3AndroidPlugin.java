package br.com.a3locacao.a3manager;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "A3Android")
public class A3AndroidPlugin extends Plugin {

    private static final String PREFS_NAME = "a3_android_sync_config";
    private static final String KEY_ALIAS = "a3_manager_android_sync_token";
    private static final String DEFAULT_BASE_URL = "http://10.155.37.230:3000";
    private static final String DEFAULT_DATABASE = "a3_manager";
    private static final int TIMEOUT_MS = 5000;
    private static final Map<String, String[]> TABLE_COLUMNS = buildTableColumns();

    @PluginMethod
    public void getPublicConfig(PluginCall call) {
        call.resolve(publicConfig());
    }

    @PluginMethod
    public void saveConfig(PluginCall call) {
        String baseUrl = normalizeBaseUrl(call.getString("baseUrl", DEFAULT_BASE_URL));
        String database = normalizeDatabase(call.getString("database", DEFAULT_DATABASE));
        String token = call.getString("token", "");

        if (database == null) {
            call.reject("Nome do banco remoto inválido.", "VALIDATION_ERROR");
            return;
        }

        try {
            SharedPreferences.Editor editor = prefs().edit()
                .putString("baseUrl", baseUrl)
                .putString("database", database);
            if (token != null && !token.trim().isEmpty()) {
                EncryptedToken encrypted = encryptToken(token.trim());
                editor
                    .putString("tokenCiphertext", encrypted.ciphertext)
                    .putString("tokenIv", encrypted.iv);
            }
            editor.apply();
            call.resolve(publicConfig());
        } catch (Exception ex) {
            call.reject(
                "Não foi possível proteger as credenciais neste Android.",
                "A3-SYNC-009"
            );
        }
    }

    @PluginMethod
    public void testConnection(PluginCall call) {
        try {
            String baseUrl = normalizeBaseUrl(call.getString("baseUrl", DEFAULT_BASE_URL));
            String database = normalizeDatabase(call.getString("database", DEFAULT_DATABASE));
            String token = call.getString("token", "");
            if (database == null) {
                call.resolve(syncTest(false, false, false, false, "Nome do banco remoto inválido."));
                return;
            }
            if (token == null || token.trim().isEmpty()) {
                token = readStoredToken();
            }

            request(baseUrl, "/health", "GET", null, null);
            JSONObject databases = request(baseUrl, "/v1/databases", "GET", null, token);
            boolean found = false;
            JSONArray list = databases.optJSONArray("databases");
            if (list != null) {
                for (int index = 0; index < list.length(); index += 1) {
                    JSONObject item = list.optJSONObject(index);
                    if (item != null && database.equals(item.optString("name"))) {
                        found = true;
                    }
                }
            }
            call.resolve(syncTest(found, true, true, found, found
                ? "Conexão com o servidor de sincronização confirmada."
                : "Banco informado não encontrado no servidor de sincronização."));
        } catch (A3NativeException ex) {
            call.resolve(syncTest(false, false, false, false, ex.getMessage()));
        } catch (Exception ex) {
            call.resolve(syncTest(false, false, false, false, "Servidor de sincronização indisponível."));
        }
    }

    @PluginMethod
    public void listRemoteTables(PluginCall call) {
        try {
            JSONObject response = query(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (" +
                    placeholders(TABLE_COLUMNS.size() + 1) +
                    ") ORDER BY name",
                tableNamesWithMetadata()
            );
            call.resolve(new JSObject().put("tables", columnValues(response.optJSONArray("rows"), "name")));
        } catch (Exception ex) {
            rejectRemote(call, ex);
        }
    }

    @PluginMethod
    public void readMetadata(PluginCall call) {
        try {
            String key = call.getString("key", "");
            JSONObject response = query(
                "SELECT value FROM a3_sync_metadata WHERE key = ? LIMIT 1",
                new JSONArray().put(key)
            );
            JSONArray rows = response.optJSONArray("rows");
            JSONObject first = rows != null && rows.length() > 0 ? rows.optJSONObject(0) : null;
            call.resolve(new JSObject().put("value", first == null ? JSONObject.NULL : first.opt("value")));
        } catch (Exception ex) {
            rejectRemote(call, ex);
        }
    }

    @PluginMethod
    public void tableInfo(PluginCall call) {
        try {
            String table = requireAllowedTable(call.getString("table", ""));
            JSONObject response = query("PRAGMA table_info(" + table + ")", new JSONArray());
            call.resolve(new JSObject().put("columns", columnValues(response.optJSONArray("rows"), "name")));
        } catch (Exception ex) {
            rejectRemote(call, ex);
        }
    }

    @PluginMethod
    public void countRows(PluginCall call) {
        try {
            String table = requireAllowedTable(call.getString("table", ""));
            JSONObject response = query("SELECT COUNT(*) AS total FROM " + table, new JSONArray());
            JSONArray rows = response.optJSONArray("rows");
            JSONObject first = rows != null && rows.length() > 0 ? rows.optJSONObject(0) : null;
            call.resolve(new JSObject().put("total", first == null ? 0 : first.optLong("total", 0)));
        } catch (Exception ex) {
            rejectRemote(call, ex);
        }
    }

    @PluginMethod
    public void selectRows(PluginCall call) {
        try {
            String table = requireAllowedTable(call.getString("table", ""));
            int limit = Math.max(1, Math.min(call.getInt("limit", 500), 500));
            int offset = Math.max(0, call.getInt("offset", 0));
            JSONArray requested = call.getArray("columns", new JSArray());
            String[] columns = requireAllowedColumns(table, requested);
            JSONObject response = query(
                "SELECT " + String.join(", ", columns) +
                    " FROM " + table +
                    " ORDER BY id LIMIT ? OFFSET ?",
                new JSONArray().put(limit).put(offset)
            );
            call.resolve(new JSObject().put("rows", response.optJSONArray("rows")));
        } catch (Exception ex) {
            rejectRemote(call, ex);
        }
    }

    @PluginMethod
    public void upsertRow(PluginCall call) {
        try {
            String table = requireAllowedTable(call.getString("table", ""));
            JSObject row = call.getObject("row", new JSObject());
            String[] columns = TABLE_COLUMNS.get(table);
            JSONArray params = new JSONArray();
            for (String column : columns) {
                params.put(row.has(column) ? row.opt(column) : JSONObject.NULL);
            }
            execute(buildUpsertSql(table, columns), params);
            call.resolve(new JSObject().put("changes", 1));
        } catch (Exception ex) {
            rejectRemote(call, ex);
        }
    }

    @PluginMethod
    public void deleteRow(PluginCall call) {
        try {
            String table = requireAllowedTable(call.getString("table", ""));
            String id = call.getString("id", "");
            execute("DELETE FROM " + table + " WHERE id = ?", new JSONArray().put(id));
            call.resolve(new JSObject().put("changes", 1));
        } catch (Exception ex) {
            rejectRemote(call, ex);
        }
    }

    private JSObject publicConfig() {
        SharedPreferences prefs = prefs();
        return new JSObject()
            .put("baseUrl", normalizeBaseUrl(prefs.getString("baseUrl", DEFAULT_BASE_URL)))
            .put("database", prefs.getString("database", DEFAULT_DATABASE))
            .put("tokenConfigured", prefs.contains("tokenCiphertext") && prefs.contains("tokenIv"));
    }

    private JSONObject query(String sql, JSONArray params) throws Exception {
        JSObject publicConfig = publicConfig();
        JSONObject body = new JSONObject()
            .put("sql", sql)
            .put("params", params);
        return request(
            publicConfig.getString("baseUrl"),
            "/v1/" + publicConfig.getString("database") + "/query",
            "POST",
            body,
            readStoredToken()
        );
    }

    private JSONObject execute(String sql, JSONArray params) throws Exception {
        JSObject publicConfig = publicConfig();
        JSONObject body = new JSONObject()
            .put("sql", sql)
            .put("params", params);
        return request(
            publicConfig.getString("baseUrl"),
            "/v1/" + publicConfig.getString("database") + "/execute",
            "POST",
            body,
            readStoredToken()
        );
    }

    private JSONObject request(
        String baseUrl,
        String path,
        String method,
        JSONObject body,
        String token
    ) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(baseUrl + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            if (token != null && !token.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + token);
            }
            if (body != null) {
                byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(payload.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(payload);
                }
            }

            int status = connection.getResponseCode();
            String text = readStream(
                status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream()
            );
            JSONObject payload = text.isEmpty() ? new JSONObject() : new JSONObject(text);
            if (status < 200 || status >= 300) {
                String message = payload.optString(
                    "error",
                    status == 401 || status == 403
                        ? "Credenciais do servidor de sincronização recusadas."
                        : "Servidor de sincronização indisponível."
                );
                throw new A3NativeException(
                    status == 401 || status == 403 ? "A3-SYNC-002" : "A3-SYNC-001",
                    sanitizeMessage(message)
                );
            }
            return payload;
        } catch (A3NativeException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new A3NativeException(
                "A3-SYNC-001",
                "Servidor de sincronização indisponível."
            );
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private String readStoredToken() throws Exception {
        SharedPreferences prefs = prefs();
        String ciphertext = prefs.getString("tokenCiphertext", "");
        String iv = prefs.getString("tokenIv", "");
        if (ciphertext.isEmpty() || iv.isEmpty()) {
            throw new A3NativeException(
                "A3-SYNC-009",
                "Servidor de sincronização não configurado."
            );
        }

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateSecretKey(),
            new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
        );
        byte[] plain = cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP));
        return new String(plain, StandardCharsets.UTF_8);
    }

    private EncryptedToken encryptToken(String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
        byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        return new EncryptedToken(
            Base64.encodeToString(encrypted, Base64.NO_WRAP),
            Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
        );
    }

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        );
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return generator.generateKey();
    }

    private String requireAllowedTable(String table) throws A3NativeException {
        if (!TABLE_COLUMNS.containsKey(table)) {
            throw new A3NativeException("VALIDATION_ERROR", "Tabela não permitida.");
        }
        return table;
    }

    private String[] requireAllowedColumns(String table, JSONArray requested)
        throws JSONException, A3NativeException {
        Set<String> allowed = new LinkedHashSet<>(Arrays.asList(TABLE_COLUMNS.get(table)));
        String[] result = new String[requested.length()];
        for (int index = 0; index < requested.length(); index += 1) {
            String column = requested.getString(index);
            if (!allowed.contains(column)) {
                throw new A3NativeException("VALIDATION_ERROR", "Coluna não permitida.");
            }
            result[index] = column;
        }
        return result;
    }

    private JSONArray tableNamesWithMetadata() {
        JSONArray params = new JSONArray();
        for (String table : TABLE_COLUMNS.keySet()) {
            params.put(table);
        }
        params.put("a3_sync_metadata");
        return params;
    }

    private JSONArray columnValues(JSONArray rows, String column) {
        JSONArray values = new JSONArray();
        if (rows == null) {
            return values;
        }
        for (int index = 0; index < rows.length(); index += 1) {
            JSONObject row = rows.optJSONObject(index);
            if (row != null) {
                values.put(row.opt(column));
            }
        }
        return values;
    }

    private String buildUpsertSql(String table, String[] columns) {
        StringBuilder update = new StringBuilder();
        for (String column : columns) {
            if ("id".equals(column)) {
                continue;
            }
            if (update.length() > 0) {
                update.append(", ");
            }
            update.append(column).append(" = excluded.").append(column);
        }
        return "INSERT INTO " + table + " (" + String.join(", ", columns) + ") " +
            "VALUES (" + placeholders(columns.length) + ") " +
            "ON CONFLICT(id) DO UPDATE SET " + update;
    }

    private String placeholders(int count) {
        String[] placeholders = new String[count];
        Arrays.fill(placeholders, "?");
        return String.join(", ", placeholders);
    }

    private String normalizeBaseUrl(String value) {
        String normalized = value == null || value.trim().isEmpty()
            ? DEFAULT_BASE_URL
            : value.trim();
        return normalized.endsWith("/")
            ? normalized.substring(0, normalized.length() - 1)
            : normalized;
    }

    private String normalizeDatabase(String value) {
        String normalized = value == null || value.trim().isEmpty()
            ? DEFAULT_DATABASE
            : value.trim();
        return normalized.matches("[A-Za-z0-9_-]+") ? normalized : null;
    }

    private JSObject syncTest(
        boolean ok,
        boolean health,
        boolean authenticated,
        boolean databaseFound,
        String message
    ) {
        return new JSObject()
            .put("ok", ok)
            .put("health", health)
            .put("authenticated", authenticated)
            .put("databaseFound", databaseFound)
            .put("message", message);
    }

    private void rejectRemote(PluginCall call, Exception ex) {
        if (ex instanceof A3NativeException) {
            A3NativeException nativeException = (A3NativeException) ex;
            call.reject(nativeException.getMessage(), nativeException.code);
            return;
        }
        call.reject("Servidor de sincronização indisponível.", "A3-SYNC-001");
    }

    private String readStream(InputStream stream) throws IOException {
        if (stream == null) {
            return "";
        }
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(stream, StandardCharsets.UTF_8)
        )) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
            return builder.toString();
        }
    }

    private String sanitizeMessage(String message) {
        return message
            .replaceAll("(?i)Bearer\\s+[A-Za-z0-9._~+/=-]+", "Bearer [REDACTED]")
            .replaceAll("(?i)token[\"']?\\s*[:=]\\s*[\"']?[^\"',\\s}]+", "token=[REDACTED]");
    }

    private static Map<String, String[]> buildTableColumns() {
        Map<String, String[]> tables = new LinkedHashMap<>();
        tables.put("users", new String[] {
            "id", "username", "username_normalized", "password_hash", "role",
            "active", "created_at", "updated_at"
        });
        tables.put("company_settings", new String[] {
            "id", "legal_name", "trade_name", "document", "street",
            "neighborhood", "number", "cep", "city", "state", "contact",
            "email", "updated_at"
        });
        tables.put("customers", new String[] {
            "id", "customer_type", "name", "name_normalized", "cpf",
            "cpf_normalized", "rg", "legal_name", "legal_name_normalized",
            "trade_name", "trade_name_normalized", "cnpj", "cnpj_normalized",
            "state_registration", "street", "neighborhood", "number", "cep",
            "city", "state", "contact", "archived_at", "created_at",
            "updated_at"
        });
        tables.put("equipment", new String[] {
            "id", "name", "name_normalized", "equipment_value_cents",
            "daily_rate_cents", "weekly_rate_cents", "biweekly_rate_cents",
            "monthly_rate_cents", "unit_indemnification_value_cents",
            "stock_quantity", "archived_at", "created_at", "updated_at"
        });
        tables.put("rentals", new String[] {
            "id", "code", "status", "customer_id", "user_id", "period",
            "start_date", "return_date", "delivery_street",
            "delivery_neighborhood", "delivery_number", "delivery_cep",
            "delivery_city", "delivery_state", "receiver_is_customer",
            "receiver_name", "receiver_cpf", "payment_method", "installments",
            "customer_name_snapshot", "customer_name_snapshot_normalized",
            "customer_snapshot_json", "company_snapshot_json",
            "launched_by_username", "finalized_at", "archived_at",
            "archived_by_user_id", "created_at", "updated_at",
            "client_request_id"
        });
        tables.put("rental_items", new String[] {
            "id", "rental_id", "equipment_id", "name_snapshot", "quantity",
            "equipment_value_cents", "unit_rental_rate_cents",
            "unit_indemnification_value_cents"
        });
        tables.put("inventory_movements", new String[] {
            "id", "equipment_id", "rental_id", "type", "quantity",
            "created_at", "note"
        });
        return tables;
    }

    private static class EncryptedToken {
        final String ciphertext;
        final String iv;

        EncryptedToken(String ciphertext, String iv) {
            this.ciphertext = ciphertext;
            this.iv = iv;
        }
    }

    private static class A3NativeException extends Exception {
        final String code;

        A3NativeException(String code, String message) {
            super(message);
            this.code = code;
        }
    }
}
